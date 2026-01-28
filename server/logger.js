/**
 * Simple Structured Logger
 * Formats logs as: [Timestamp] [Level] [Context] Message
 */

class Logger {
  constructor(context = "App") {
    this.context = context;
  }

  format(level, message, ...args) {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level}] [${this.context}] ${message} ${args.length ? JSON.stringify(args) : ""}`;
  }

  info(message, ...args) {
    console.log(this.format("INFO", message, ...args));
  }

  warn(message, ...args) {
    console.warn(this.format("WARN", message, ...args));
  }

  error(message, ...args) {
    console.error(this.format("ERROR", message, ...args));
  }

  debug(message, ...args) {
    if (process.env.DEBUG) {
      console.debug(this.format("DEBUG", message, ...args));
    }
  }
}

export default Logger;
