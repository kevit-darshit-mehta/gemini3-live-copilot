import fs from "fs";
import path from "path";

/**
 * Simple Structured Logger
 * Formats logs as: [Timestamp] [Level] [Context] Message
 * Writes to console and file (logs/app-YYYY-MM-DD.log)
 */
class Logger {
  constructor(context = "App") {
    this.context = context;
    this.logDir = path.join(process.cwd(), "logs");
    this.ensureLogDir();
  }

  ensureLogDir() {
    if (!fs.existsSync(this.logDir)) {
      try {
        fs.mkdirSync(this.logDir, { recursive: true });
      } catch (err) {
        console.error("Failed to create log directory:", err);
      }
    }
  }

  getLogFile() {
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    return path.join(this.logDir, `app-${today}.log`);
  }

  writeToFile(logMessage) {
    try {
      fs.appendFileSync(this.getLogFile(), logMessage + "\n");
    } catch (err) {
      console.error("Failed to write to log file:", err);
    }
  }

  format(level, message, ...args) {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level}] [${this.context}] ${message} ${args.length ? JSON.stringify(args) : ""}`;
  }

  log(level, message, ...args) {
    const formattedMessage = this.format(level, message, ...args);

    // Console output
    switch (level) {
      case "INFO":
        console.log(formattedMessage);
        break;
      case "WARN":
        console.warn(formattedMessage);
        break;
      case "ERROR":
        console.error(formattedMessage);
        break;
      case "DEBUG":
        if (process.env.DEBUG) console.debug(formattedMessage);
        break;
    }

    // File output
    this.writeToFile(formattedMessage);
  }

  info(message, ...args) {
    this.log("INFO", message, ...args);
  }
  warn(message, ...args) {
    this.log("WARN", message, ...args);
  }
  error(message, ...args) {
    this.log("ERROR", message, ...args);
  }
  debug(message, ...args) {
    this.log("DEBUG", message, ...args);
  }
}

export default Logger;
