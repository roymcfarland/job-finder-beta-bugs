import {
  AccountDisabledError,
  AuthConfigurationError,
  DuplicateEmailError,
  InvalidCredentialsError,
  InvalidResetTokenError,
} from "./authService.js";
import { getSessionResult } from "./apiSession.js";
import { EmailDeliveryUnavailableError } from "./notifications.js";
import {
  buildApiHeaders,
  jsonResponse,
  methodNotAllowedResponse,
  parseJsonObject,
  serializeCookie,
} from "./http.js";

export function createAuthApi(options) {
  const { config, authService, rateLimiter } = options;

  return {
    async handle(request) {
      const headers = buildApiHeaders(config.allowedOrigin, request.origin);

      if (request.method === "OPTIONS") {
        return {
          status: 204,
          headers,
          body: null,
        };
      }

      if (request.pathname === "/api/auth/session") {
        if (request.method !== "GET") {
          return methodNotAllowedResponse(headers, "GET, OPTIONS");
        }

        const { response, session } = await getSessionResult({
          authService,
          cookieHeader: request.cookieHeader,
          headers,
        });
        if (response) {
          return response;
        }

        if (!session?.user) {
          return jsonResponse(401, { error: "Unauthorized." }, headers);
        }

        return jsonResponse(
          200,
          {
            user: session.user,
          },
          headers,
        );
      }

      if (request.pathname === "/api/auth/logout") {
        if (request.method !== "POST") {
          return methodNotAllowedResponse(headers, "POST, OPTIONS");
        }

        const { response, session } = await getSessionResult({
          authService,
          cookieHeader: request.cookieHeader,
          headers,
        });
        if (response) {
          return response;
        }

        if (session?.token) {
          await authService.logout(session.token);
        }

        return {
          status: 204,
          headers: {
            ...headers,
            "set-cookie": buildExpiredSessionCookie(config),
          },
          body: null,
        };
      }

      if (request.method !== "POST") {
        return methodNotAllowedResponse(headers, "POST, OPTIONS");
      }

      const limitResult = rateLimiter.consume(request.ip || "unknown", Date.now());
      if (!limitResult.allowed) {
        return jsonResponse(
          429,
          { error: "Too many authentication attempts. Please try again shortly." },
          {
            ...headers,
            "retry-after": String(limitResult.retryAfterSeconds),
          },
        );
      }

      let payload;

      try {
        payload = parseJsonObject(request.rawBody);
      } catch {
        return jsonResponse(400, { error: "Send a valid JSON payload." }, headers);
      }

      if (request.pathname === "/api/auth/register") {
        return handleRegistration({ authService, config, headers, payload, request });
      }

      if (request.pathname === "/api/auth/login") {
        return handleLogin({ authService, config, headers, payload, request });
      }

      if (request.pathname === "/api/auth/request-password-reset") {
        return handleResetRequest({ authService, headers, payload });
      }

      if (request.pathname === "/api/auth/reset-password") {
        return handleReset({ authService, config, headers, payload, request });
      }

      return jsonResponse(404, { error: "Not found." }, headers);
    },
  };
}

async function handleRegistration({ authService, config, headers, payload, request }) {
  const fieldErrors = authService.validateRegistrationInput(payload);
  if (hasFieldErrors(fieldErrors)) {
    return jsonResponse(
      400,
      { error: "Please review the highlighted fields and try again.", fieldErrors },
      headers,
    );
  }

  try {
    const result = await authService.register({
      email: payload.email,
      password: payload.password,
      ipAddress: request.ip,
      userAgent: request.userAgent,
    });

    return jsonResponse(
      201,
      { message: "Account created.", user: result.user },
      {
        ...headers,
        "set-cookie": buildSessionCookie(config, result),
      },
    );
  } catch (error) {
    if (error instanceof DuplicateEmailError) {
      return jsonResponse(
        409,
        {
          error: error.message,
          fieldErrors: {
            email: error.message,
          },
        },
        headers,
      );
    }

    if (error instanceof AuthConfigurationError) {
      return jsonResponse(503, { error: error.message }, headers);
    }

    throw error;
  }
}

async function handleLogin({ authService, config, headers, payload, request }) {
  const fieldErrors = authService.validateLoginInput({
    email: payload.email,
    password: payload.password,
  });

  if (fieldErrors.email || fieldErrors.password) {
    return jsonResponse(
      400,
      { error: "Please review the highlighted fields and try again.", fieldErrors },
      headers,
    );
  }

  try {
    const result = await authService.login({
      email: payload.email,
      password: payload.password,
      ipAddress: request.ip,
      userAgent: request.userAgent,
    });

    return jsonResponse(
      200,
      { message: "Signed in.", user: result.user },
      {
        ...headers,
        "set-cookie": buildSessionCookie(config, result),
      },
    );
  } catch (error) {
    if (error instanceof InvalidCredentialsError) {
      return jsonResponse(
        401,
        {
          error: error.message,
          fieldErrors: {
            email: error.message,
            password: "Check your password and try again.",
          },
        },
        headers,
      );
    }

    if (error instanceof AccountDisabledError) {
      return jsonResponse(
        403,
        {
          error: error.message,
          fieldErrors: {
            email: error.message,
          },
        },
        headers,
      );
    }

    if (error instanceof AuthConfigurationError) {
      return jsonResponse(503, { error: error.message }, headers);
    }

    throw error;
  }
}

async function handleResetRequest({ authService, headers, payload }) {
  const email = authService.normalizeEmail(payload.email);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse(
      400,
      {
        error: "Please review the highlighted fields and try again.",
        fieldErrors: {
          email: "Enter a valid email address.",
        },
      },
      headers,
    );
  }

  try {
    await authService.requestPasswordReset({ email });
    return jsonResponse(
      200,
      {
        message:
          "If that email is registered, a password reset link is on the way.",
      },
      headers,
    );
  } catch (error) {
    if (
      error instanceof AuthConfigurationError ||
      error instanceof EmailDeliveryUnavailableError
    ) {
      return jsonResponse(503, { error: error.message }, headers);
    }

    throw error;
  }
}

async function handleReset({ authService, config, headers, payload, request }) {
  const fieldErrors = authService.validateResetInput(payload);

  if (!payload.token || typeof payload.token !== "string") {
    fieldErrors.password = fieldErrors.password || "";
    fieldErrors.token = "This reset link is invalid or has expired.";
  }

  if (hasFieldErrors(fieldErrors)) {
    return jsonResponse(
      400,
      { error: "Please review the highlighted fields and try again.", fieldErrors },
      headers,
    );
  }

  try {
    const result = await authService.resetPassword({
      token: payload.token,
      password: payload.password,
      ipAddress: request.ip,
      userAgent: request.userAgent,
    });

    return jsonResponse(
      200,
      { message: "Password updated.", user: result.user },
      {
        ...headers,
        "set-cookie": buildSessionCookie(config, result),
      },
    );
  } catch (error) {
    if (error instanceof InvalidResetTokenError) {
      return jsonResponse(
        400,
        {
          error: error.message,
          fieldErrors: {
            token: error.message,
          },
        },
        headers,
      );
    }

    if (error instanceof AuthConfigurationError) {
      return jsonResponse(503, { error: error.message }, headers);
    }

    throw error;
  }
}

function buildSessionCookie(config, result) {
  return serializeCookie(config.session.cookieName, result.sessionToken, {
    path: "/",
    sameSite: "Lax",
    secure: config.session.secureCookie,
    expires: result.expiresAt,
    maxAge: config.session.ttlMs / 1000,
  });
}

function buildExpiredSessionCookie(config) {
  return serializeCookie(config.session.cookieName, "", {
    path: "/",
    sameSite: "Lax",
    secure: config.session.secureCookie,
    expires: new Date(0),
    maxAge: 0,
  });
}

function hasFieldErrors(fieldErrors) {
  return Object.values(fieldErrors).some(Boolean);
}
