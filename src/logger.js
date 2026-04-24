export function createLogger(target = console) {
  return {
    info(message, context) {
      writeLog(target, "info", message, context);
    },
    warn(message, context) {
      writeLog(target, "warn", message, context);
    },
    error(message, context) {
      writeLog(target, "error", message, context);
    },
  };
}

export function getErrorContext(error) {
  if (!(error instanceof Error)) {
    return { error: String(error) };
  }

  return {
    errorName: error.name,
    errorMessage: error.message,
    stack: error.stack,
  };
}

function writeLog(target, level, message, context) {
  const log = target[level] ?? target.log;

  if (typeof log !== "function") {
    return;
  }

  if (context === undefined) {
    log.call(target, message);
    return;
  }

  log.call(target, message, context);
}
