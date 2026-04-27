import crypto from "node:crypto";

import { getConfig } from "./config.js";
import { DatabaseNotConfiguredError, query, withTransaction } from "./db.js";
import { parseCookies } from "./http.js";
import { getErrorContext } from "./logger.js";
import { EmailDeliveryUnavailableError } from "./notifications.js";
import { hashPassword, validatePassword, verifyPassword } from "./passwords.js";
import { createOpaqueToken, hashToken } from "./tokens.js";

// Lazily computed scrypt hash for a throwaway password. We verify the supplied
// password against this when the email isn't found so login latency doesn't
// reveal whether an account exists.
let timingDecoyHashPromise = null;
function getTimingDecoyHash() {
  if (!timingDecoyHashPromise) {
    timingDecoyHashPromise = hashPassword(crypto.randomBytes(24).toString("base64url"));
  }
  return timingDecoyHashPromise;
}

export class DuplicateEmailError extends Error {
  constructor() {
    super("An account with that email already exists.");
    this.name = "DuplicateEmailError";
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Invalid email or password.");
    this.name = "InvalidCredentialsError";
  }
}

export class InvalidResetTokenError extends Error {
  constructor() {
    super("This reset link is invalid or has expired.");
    this.name = "InvalidResetTokenError";
  }
}

export class AccountDisabledError extends Error {
  constructor() {
    super("This account has been disabled. Contact the admin if you need access again.");
    this.name = "AccountDisabledError";
  }
}

export class AuthConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuthConfigurationError";
  }
}

export function createAuthService(options = {}) {
  const config = options.config ?? getConfig();
  const now = options.now ?? (() => new Date());
  const notifications = options.notifications;
  const logger = options.logger ?? console;

  return {
    normalizeEmail,

    validateRegistrationInput({ email, password }) {
      return validateCredentials({ email, password, minimumLength: config.passwordMinLength });
    },

    validateLoginInput({ email, password }) {
      const errors = {};

      if (!isLikelyEmail(email)) {
        errors.email = "Enter a valid email address.";
      }

      if (typeof password !== "string" || password.length === 0) {
        errors.password = "Enter your password.";
      }

      return errors;
    },

    validateResetInput({ password }) {
      return {
        password: validatePassword(password, config.passwordMinLength),
      };
    },

    async register({ email, password, ipAddress, userAgent }) {
      const normalizedEmail = normalizeEmail(email);
      const passwordHash = await hashPassword(password);
      const session = createSessionRecord(now(), config.session.ttlMs, ipAddress, userAgent);
      const role = getRoleForEmail(config, normalizedEmail);

      try {
        await withTransaction(config, async (client) => {
          const userId = crypto.randomUUID();

          await client.query(
            `
              INSERT INTO users (id, email, password_hash, role)
              VALUES ($1, $2, $3, $4)
            `,
            [userId, normalizedEmail, passwordHash, role],
          );

          await client.query(
            `
              INSERT INTO sessions (id, user_id, token_hash, expires_at, ip_address, user_agent)
              VALUES ($1, $2, $3, $4, $5, $6)
            `,
            [
              session.id,
              userId,
              session.tokenHash,
              session.expiresAt,
              session.ipAddress,
              session.userAgent,
            ],
          );

          session.user = {
            id: userId,
            email: normalizedEmail,
            role,
            isAdmin: role === "admin",
          };
        });
      } catch (error) {
        if (error instanceof DatabaseNotConfiguredError) {
          throw new AuthConfigurationError(error.message);
        }

        if (error?.code === "23505") {
          throw new DuplicateEmailError();
        }

        throw error;
      }

      return {
        user: session.user,
        sessionToken: session.token,
        expiresAt: session.expiresAt,
      };
    },

    async login({ email, password, ipAddress, userAgent }) {
      let user;

      try {
        const result = await query(
          config,
          `
            SELECT id, email, password_hash
                , role
                , disabled_at
            FROM users
            WHERE email = $1
            LIMIT 1
          `,
          [normalizeEmail(email)],
        );

        user = result.rows[0];
      } catch (error) {
        if (error instanceof DatabaseNotConfiguredError) {
          throw new AuthConfigurationError(error.message);
        }

        throw error;
      }

      if (!user) {
        // Run a real scrypt verification against a decoy hash so the response
        // time matches the "wrong password" path and doesn't leak account
        // existence.
        await verifyPassword(typeof password === "string" ? password : "", await getTimingDecoyHash());
        throw new InvalidCredentialsError();
      }

      if (!(await verifyPassword(password, user.password_hash))) {
        throw new InvalidCredentialsError();
      }

      if (user.disabled_at) {
        throw new AccountDisabledError();
      }

      const previousRole = user.role;
      try {
        user.role = await synchronizeAdminRole({
          config,
          userId: user.id,
          email: user.email,
          currentRole: previousRole,
        });
      } catch (error) {
        if (error instanceof DatabaseNotConfiguredError) {
          throw new AuthConfigurationError(error.message);
        }

        throw error;
      }

      if (previousRole === "admin" && user.role !== "admin") {
        // Just demoted this user (email removed from ADMIN_EMAILS). Drop
        // their other sessions so any already-open admin tabs lose access
        // on the next request.
        await query(
          config,
          `DELETE FROM sessions WHERE user_id = $1`,
          [user.id],
        );
      }

      const session = createSessionRecord(now(), config.session.ttlMs, ipAddress, userAgent);

      try {
        await query(
          config,
          `
            INSERT INTO sessions (id, user_id, token_hash, expires_at, ip_address, user_agent)
            VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [
            session.id,
            user.id,
            session.tokenHash,
            session.expiresAt,
            session.ipAddress,
            session.userAgent,
          ],
        );
      } catch (error) {
        if (error instanceof DatabaseNotConfiguredError) {
          throw new AuthConfigurationError(error.message);
        }

        throw error;
      }

      return {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          isAdmin: user.role === "admin",
        },
        sessionToken: session.token,
        expiresAt: session.expiresAt,
      };
    },

    async getSessionFromCookie(cookieHeader) {
      const cookies = parseCookies(cookieHeader);
      const token = cookies[config.session.cookieName];

      if (!token) {
        return null;
      }

      try {
        const result = await query(
          config,
          `
            SELECT
              sessions.id AS session_id,
              sessions.expires_at,
              users.id AS user_id,
              users.email,
              users.role,
              users.disabled_at
            FROM sessions
            INNER JOIN users ON users.id = sessions.user_id
            WHERE sessions.token_hash = $1
              AND sessions.expires_at > NOW()
            LIMIT 1
          `,
          [hashToken(token)],
        );

        const row = result.rows[0];
        if (!row) {
          return null;
        }

        if (row.disabled_at) {
          await query(
            config,
            `
              DELETE FROM sessions
              WHERE id = $1
            `,
            [row.session_id],
          );
          return null;
        }

        const previousRole = row.role || "user";
        const role = await synchronizeAdminRole({
          config,
          userId: row.user_id,
          email: row.email,
          currentRole: previousRole,
        });

        if (previousRole === "admin" && role !== "admin") {
          // Demoted in real-time. Drop every session for this user including
          // the current one so the admin UI can't keep working on stale
          // permissions until logout.
          await query(
            config,
            `DELETE FROM sessions WHERE user_id = $1`,
            [row.user_id],
          );
          return null;
        }

        // Refresh last_seen_at at most every few minutes to avoid a write on
        // every authenticated request. Rounded to keep this off the hot path.
        await query(
          config,
          `
            UPDATE sessions
            SET last_seen_at = NOW()
            WHERE id = $1
              AND last_seen_at < NOW() - INTERVAL '5 minutes'
          `,
          [row.session_id],
        );

        return {
          token,
          sessionId: row.session_id,
          expiresAt: row.expires_at,
          user: {
            id: row.user_id,
            email: row.email,
            role,
            isAdmin: role === "admin",
          },
        };
      } catch (error) {
        if (error instanceof DatabaseNotConfiguredError) {
          throw new AuthConfigurationError(error.message);
        }

        throw error;
      }
    },

    async logout(sessionToken) {
      if (!sessionToken) {
        return;
      }

      try {
        await query(
          config,
          `
            DELETE FROM sessions
            WHERE token_hash = $1
          `,
          [hashToken(sessionToken)],
        );
      } catch (error) {
        if (error instanceof DatabaseNotConfiguredError) {
          throw new AuthConfigurationError(error.message);
        }

        throw error;
      }
    },

    async requestPasswordReset({ email }) {
      if (!notifications) {
        throw new AuthConfigurationError("Notification service is unavailable.");
      }

      const normalizedEmail = normalizeEmail(email);

      let user;
      try {
        const result = await query(
          config,
          `
            SELECT id, email, disabled_at
            FROM users
            WHERE email = $1
            LIMIT 1
          `,
          [normalizedEmail],
        );

        user = result.rows[0];
      } catch (error) {
        if (error instanceof DatabaseNotConfiguredError) {
          throw new AuthConfigurationError(error.message);
        }

        throw error;
      }

      if (!user || user.disabled_at) {
        return { delivered: false };
      }

      const token = createOpaqueToken();
      const tokenId = crypto.randomUUID();
      const expiresAt = new Date(now().getTime() + config.passwordReset.ttlMs);

      try {
        await query(
          config,
          `
            INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
            VALUES ($1, $2, $3, $4)
          `,
          [tokenId, user.id, hashToken(token), expiresAt],
        );
      } catch (error) {
        if (error instanceof DatabaseNotConfiguredError) {
          throw new AuthConfigurationError(error.message);
        }

        throw error;
      }

      const resetUrl = `${config.baseUrl}/reset-password?token=${encodeURIComponent(token)}`;

      try {
        const delivery = await notifications.sendPasswordResetEmail({
          email: user.email,
          resetUrl,
        });

        return {
          delivered: true,
          deliveryMode: delivery.mode,
        };
      } catch (error) {
        try {
          await query(
            config,
            `
              DELETE FROM password_reset_tokens
              WHERE id = $1
            `,
            [tokenId],
          );
        } catch (cleanupError) {
          logWarning(logger, "Password reset token cleanup failed.", cleanupError);
        }

        if (error instanceof EmailDeliveryUnavailableError) {
          throw error;
        }

        throw error;
      }
    },

    async resetPassword({ token, password, ipAddress, userAgent }) {
      const tokenHash = hashToken(token);
      const passwordHash = await hashPassword(password);
      const session = createSessionRecord(now(), config.session.ttlMs, ipAddress, userAgent);

      try {
        await withTransaction(config, async (client) => {
          const tokenResult = await client.query(
            `
              SELECT password_reset_tokens.id, password_reset_tokens.user_id
              FROM password_reset_tokens
              INNER JOIN users ON users.id = password_reset_tokens.user_id
              WHERE token_hash = $1
                AND used_at IS NULL
                AND expires_at > NOW()
                AND users.disabled_at IS NULL
              LIMIT 1
            `,
            [tokenHash],
          );

          const resetToken = tokenResult.rows[0];
          if (!resetToken) {
            throw new InvalidResetTokenError();
          }

          await client.query(
            `
              UPDATE users
              SET password_hash = $1, updated_at = NOW()
              WHERE id = $2
            `,
            [passwordHash, resetToken.user_id],
          );

          await client.query(
            `
              UPDATE password_reset_tokens
              SET used_at = NOW()
              WHERE id = $1
            `,
            [resetToken.id],
          );

          await client.query(
            `
              DELETE FROM sessions
              WHERE user_id = $1
            `,
            [resetToken.user_id],
          );

          await client.query(
            `
              INSERT INTO sessions (id, user_id, token_hash, expires_at, ip_address, user_agent)
              VALUES ($1, $2, $3, $4, $5, $6)
            `,
            [
              session.id,
              resetToken.user_id,
              session.tokenHash,
              session.expiresAt,
              session.ipAddress,
              session.userAgent,
            ],
          );

          const userResult = await client.query(
            `
              SELECT id, email, role
              FROM users
              WHERE id = $1
              LIMIT 1
            `,
            [resetToken.user_id],
          );

          const user = userResult.rows[0];
          session.user = {
            id: user.id,
            email: user.email,
            role: user.role,
            isAdmin: user.role === "admin",
          };
        });
      } catch (error) {
        if (error instanceof DatabaseNotConfiguredError) {
          throw new AuthConfigurationError(error.message);
        }

        throw error;
      }

      return {
        user: session.user,
        sessionToken: session.token,
        expiresAt: session.expiresAt,
      };
    },
  };
}

export function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

function validateCredentials({ email, password, minimumLength }) {
  const errors = {};

  if (!isLikelyEmail(email)) {
    errors.email = "Enter a valid email address.";
  }

  const passwordError = validatePassword(password, minimumLength);
  if (passwordError) {
    errors.password = passwordError;
  }

  return errors;
}

function isLikelyEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

// Source of truth for who counts as an admin is the ADMIN_EMAILS env list,
// but only when that list is actually configured. A non-empty list returns
// "admin" for matching emails and "user" for everyone else, so removing an
// email demotes that account on next login or session refresh. Callers must
// check config.adminEmails.length first; this helper assumes the list is set.
function getRoleForEmail(config, email) {
  return config.adminEmails.includes(normalizeEmail(email)) ? "admin" : "user";
}

async function synchronizeAdminRole({ config, userId, email, currentRole }) {
  const normalizedCurrent = currentRole || "user";

  // Treat an unset/empty ADMIN_EMAILS as "not configured" rather than
  // "demote everyone". Otherwise a missing env var on a fresh deploy or a
  // bad pull would silently strip admin from every account on next request.
  if (config.adminEmails.length === 0) {
    return normalizedCurrent;
  }

  const desiredRole = getRoleForEmail(config, email);

  if (desiredRole === normalizedCurrent) {
    return normalizedCurrent;
  }

  await query(
    config,
    `
      UPDATE users
      SET role = $1, updated_at = NOW()
      WHERE id = $2
    `,
    [desiredRole, userId],
  );

  return desiredRole;
}

function createSessionRecord(currentTime, ttlMs, ipAddress, userAgent) {
  const token = createOpaqueToken();

  return {
    id: crypto.randomUUID(),
    token,
    tokenHash: hashToken(token),
    expiresAt: new Date(currentTime.getTime() + ttlMs),
    ipAddress: String(ipAddress ?? "").slice(0, 120),
    userAgent: String(userAgent ?? "").slice(0, 400),
  };
}

function logWarning(logger, message, error) {
  const log = logger.warn ?? logger.log;
  if (typeof log === "function") {
    log.call(logger, message, getErrorContext(error));
  }
}
