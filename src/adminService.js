import { getConfig } from "./config.js";
import { DatabaseNotConfiguredError, query, withTransaction } from "./db.js";

export class AdminConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "AdminConfigurationError";
  }
}

export class AdminPermissionError extends Error {
  constructor() {
    super("Admin access required.");
    this.name = "AdminPermissionError";
  }
}

export class AdminActionError extends Error {
  constructor(message) {
    super(message);
    this.name = "AdminActionError";
  }
}

export class AdminNotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = "AdminNotFoundError";
  }
}

export function createAdminService(options = {}) {
  const config = options.config ?? getConfig();

  return {
    async getDashboardData() {
      try {
        const [summaryResult, usersResult] = await Promise.all([
          query(
            config,
            `
              SELECT
                (SELECT COUNT(*)::int FROM users) AS total_users,
                (SELECT COUNT(*)::int FROM users WHERE disabled_at IS NULL) AS active_users,
                (SELECT COUNT(*)::int FROM users WHERE disabled_at IS NOT NULL) AS disabled_users,
                (SELECT COUNT(*)::int FROM bug_reports) AS total_comments,
                (SELECT COUNT(*)::int FROM bug_reports WHERE resolved_at IS NULL) AS unresolved_comments,
                (SELECT COUNT(*)::int FROM bug_reports WHERE resolved_at IS NOT NULL) AS resolved_comments
            `,
          ),
          query(
            config,
            `
              SELECT
                users.id,
                users.email,
                users.role,
                users.disabled_at,
                users.created_at,
                COUNT(bug_reports.id)::int AS total_comment_count,
                COUNT(*) FILTER (
                  WHERE bug_reports.id IS NOT NULL AND bug_reports.resolved_at IS NULL
                )::int AS unresolved_comment_count
              FROM users
              LEFT JOIN bug_reports ON bug_reports.user_id = users.id
              GROUP BY users.id
              ORDER BY
                CASE WHEN users.role = 'admin' THEN 0 ELSE 1 END,
                users.created_at ASC
            `,
          ),
        ]);

        return {
          summary: summaryResult.rows[0] ?? {
            total_users: 0,
            active_users: 0,
            disabled_users: 0,
            total_comments: 0,
            unresolved_comments: 0,
            resolved_comments: 0,
          },
          users: usersResult.rows.map((row) => ({
            id: row.id,
            email: row.email,
            role: row.role,
            isDisabled: Boolean(row.disabled_at),
            createdAt: row.created_at,
            totalCommentCount: row.total_comment_count,
            unresolvedCommentCount: row.unresolved_comment_count,
          })),
        };
      } catch (error) {
        if (error instanceof DatabaseNotConfiguredError) {
          throw new AdminConfigurationError(error.message);
        }

        throw error;
      }
    },

    async listComments({ userId = "", status = "all" }) {
      const normalizedStatus = ["all", "resolved", "unresolved"].includes(status)
        ? status
        : "all";
      const filterUserId = String(userId || "").trim();

      try {
        const result = await query(
          config,
          `
            SELECT
              bug_reports.id,
              bug_reports.user_id,
              bug_reports.reporter_email,
              bug_reports.summary,
              bug_reports.category,
              bug_reports.severity,
              bug_reports.affected_url,
              bug_reports.happened,
              bug_reports.reproduce_steps,
              bug_reports.expected_behavior,
              bug_reports.extra_details,
              bug_reports.created_at,
              bug_reports.resolved_at,
              users.email AS user_email,
              users.disabled_at AS user_disabled_at
            FROM bug_reports
            INNER JOIN users ON users.id = bug_reports.user_id
            WHERE ($1 = '' OR bug_reports.user_id = $1)
              AND (
                $2 = 'all'
                OR ($2 = 'resolved' AND bug_reports.resolved_at IS NOT NULL)
                OR ($2 = 'unresolved' AND bug_reports.resolved_at IS NULL)
              )
            ORDER BY
              CASE WHEN bug_reports.resolved_at IS NULL THEN 0 ELSE 1 END,
              bug_reports.created_at DESC
          `,
          [filterUserId, normalizedStatus],
        );

        return result.rows.map((row) => ({
          id: row.id,
          userId: row.user_id,
          userEmail: row.user_email,
          reporterEmail: row.reporter_email,
          summary: row.summary,
          category: row.category,
          severity: row.severity,
          affectedUrl: row.affected_url,
          happened: row.happened,
          reproduceSteps: row.reproduce_steps,
          expectedBehavior: row.expected_behavior,
          extraDetails: row.extra_details,
          createdAt: row.created_at,
          resolvedAt: row.resolved_at,
          isResolved: Boolean(row.resolved_at),
          isUserDisabled: Boolean(row.user_disabled_at),
        }));
      } catch (error) {
        if (error instanceof DatabaseNotConfiguredError) {
          throw new AdminConfigurationError(error.message);
        }

        throw error;
      }
    },

    async setCommentResolved({ adminUser, commentId, resolved }) {
      try {
        const result = await query(
          config,
          `
            UPDATE bug_reports
            SET
              resolved_at = CASE WHEN $2 THEN NOW() ELSE NULL END,
              resolved_by_user_id = CASE WHEN $2 THEN $3 ELSE NULL END
            WHERE id = $1
            RETURNING id, resolved_at
          `,
          [commentId, Boolean(resolved), adminUser.id],
        );

        const row = result.rows[0];
        if (!row) {
          throw new AdminNotFoundError("Comment not found.");
        }

        return {
          id: row.id,
          isResolved: Boolean(row.resolved_at),
          resolvedAt: row.resolved_at,
        };
      } catch (error) {
        if (error instanceof DatabaseNotConfiguredError) {
          throw new AdminConfigurationError(error.message);
        }

        throw error;
      }
    },

    async setUserDisabled({ adminUser, targetUserId, disabled }) {
      if (adminUser.id === targetUserId) {
        throw new AdminActionError("You can't disable your own admin account.");
      }

      try {
        return withTransaction(config, async (client) => {
          const updateResult = await client.query(
            `
              UPDATE users
              SET
                disabled_at = CASE WHEN $2 THEN NOW() ELSE NULL END,
                disabled_by_user_id = CASE WHEN $2 THEN $3 ELSE NULL END,
                updated_at = NOW()
              WHERE id = $1
              RETURNING id, email, role, disabled_at
            `,
            [targetUserId, Boolean(disabled), adminUser.id],
          );

          const user = updateResult.rows[0];
          if (!user) {
            throw new AdminNotFoundError("User not found.");
          }

          if (disabled) {
            await client.query(
              `
                DELETE FROM sessions
                WHERE user_id = $1
              `,
              [targetUserId],
            );
          }

          return {
            id: user.id,
            email: user.email,
            role: user.role,
            isDisabled: Boolean(user.disabled_at),
          };
        });
      } catch (error) {
        if (error instanceof DatabaseNotConfiguredError) {
          throw new AdminConfigurationError(error.message);
        }

        throw error;
      }
    },
  };
}
