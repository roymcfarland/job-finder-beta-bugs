import { buildBugReportSubmission } from "./bugReportSchema.js";
import { getConfig } from "./config.js";
import { DatabaseNotConfiguredError, query } from "./db.js";
import { getErrorContext } from "./logger.js";

export class BugReportConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "BugReportConfigurationError";
  }
}

export function createBugReportService(options = {}) {
  const config = options.config ?? getConfig();
  const notifications = options.notifications;
  const logger = options.logger ?? console;
  const now = options.now ?? (() => new Date());

  return {
    async submit({ user, payload, userAgent }) {
      const report = buildBugReportSubmission(payload, {
        now: now(),
        userAgent,
        skipReporterEmail: true,
      });

      report.reporter.email = user.email;

      const reportId = report.meta.submissionId;

      try {
        await query(
          config,
          `
            INSERT INTO bug_reports (
              id,
              user_id,
              reporter_email,
              reporter_name,
              summary,
              category,
              severity,
              affected_url,
              happened,
              reproduce_steps,
              expected_behavior,
              extra_details,
              client_context,
              source,
              user_agent
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15
            )
          `,
          [
            reportId,
            user.id,
            user.email,
            report.reporter.name,
            report.report.summary,
            report.report.category,
            report.report.severity,
            report.report.affectedUrl,
            report.report.happened,
            report.report.reproduceSteps,
            report.report.expectedBehavior,
            report.report.extraDetails,
            JSON.stringify(report.client),
            report.meta.source,
            report.meta.userAgent,
          ],
        );
      } catch (error) {
        if (error instanceof DatabaseNotConfiguredError) {
          throw new BugReportConfigurationError(error.message);
        }

        throw error;
      }

      // "stored-only"  -> notifications intentionally unconfigured
      // "notify-failed" -> configured target rejected the delivery
      // delivery.mode   -> "resend" | "webhook" | "console" on success
      let notificationMode = "stored-only";

      if (notifications) {
        try {
          const delivery = await notifications.sendBugReportNotification({
            reporterEmail: user.email,
            report,
          });

          notificationMode = delivery.mode === "disabled" ? "stored-only" : delivery.mode;
        } catch (error) {
          notificationMode = "notify-failed";
          logWarning(logger, "Bug report notification failed.", error);
        }
      }

      return {
        reportId,
        notificationMode,
      };
    },

    async listForUser(userId) {
      let result;

      try {
        result = await query(
          config,
          `
            SELECT id, summary, category, severity, created_at, resolved_at
            FROM bug_reports
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT 5
          `,
          [userId],
        );
      } catch (error) {
        if (error instanceof DatabaseNotConfiguredError) {
          throw new BugReportConfigurationError(error.message);
        }

        throw error;
      }

      return result.rows.map((row) => ({
        id: row.id,
        summary: row.summary,
        category: row.category,
        severity: row.severity,
        createdAt: row.created_at,
        resolvedAt: row.resolved_at,
        isResolved: Boolean(row.resolved_at),
      }));
    },
  };
}

function logWarning(logger, message, error) {
  const log = logger.warn ?? logger.log;
  if (typeof log === "function") {
    log.call(logger, message, getErrorContext(error));
  }
}
