import { getConfig } from "../src/config.js";
import { cleanupExpiredSessions, cleanupUsedResetTokens } from "../src/db.js";
import { loadEnvFiles } from "../src/loadEnv.js";
import { createLogger, getErrorContext } from "../src/logger.js";

loadEnvFiles();

const logger = createLogger();

try {
  const config = getConfig();

  const sessions = await cleanupExpiredSessions(config);
  logger.info("Pruned expired sessions.", { deleted: sessions.deleted });

  const tokens = await cleanupUsedResetTokens(config);
  logger.info("Pruned expired or used reset tokens.", { deleted: tokens.deleted });

  process.exit(0);
} catch (error) {
  logger.error("Cleanup failed.", getErrorContext(error));
  process.exit(1);
}
