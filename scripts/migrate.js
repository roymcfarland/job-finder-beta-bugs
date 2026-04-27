import { getConfig } from "../src/config.js";
import { ensureDatabase } from "../src/db.js";
import { loadEnvFiles } from "../src/loadEnv.js";
import { createLogger, getErrorContext } from "../src/logger.js";

loadEnvFiles();

const logger = createLogger();

try {
  const config = getConfig();
  await ensureDatabase(config);
  logger.info("Database schema is up to date.");
  process.exit(0);
} catch (error) {
  logger.error("Database migration failed.", getErrorContext(error));
  process.exit(1);
}
