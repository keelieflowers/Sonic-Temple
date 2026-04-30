export type LogLevel = "debug" | "info" | "warn";

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30
};

type LogMeta = Record<string, unknown>;

export class Logger {
  private readonly level: LogLevel;
  private readonly component?: string;

  constructor(level: LogLevel = "info", component?: string) {
    this.level = level;
    this.component = component;
  }

  child(component: string): Logger {
    const mergedComponent = this.component ? `${this.component}:${component}` : component;
    return new Logger(this.level, mergedComponent);
  }

  debug(message: string, meta?: LogMeta) {
    this.log("debug", message, meta);
  }

  info(message: string, meta?: LogMeta) {
    this.log("info", message, meta);
  }

  warn(message: string, meta?: LogMeta) {
    this.log("warn", message, meta);
  }

  private shouldLog(level: LogLevel) {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.level];
  }

  private log(level: LogLevel, message: string, meta?: LogMeta) {
    if (!this.shouldLog(level)) {
      return;
    }

    const payload = {
      timestamp: new Date().toISOString(),
      level,
      component: this.component ?? "app",
      message,
      ...(meta ? { meta } : {})
    };

    const line = JSON.stringify(payload);
    if (level === "warn") {
      console.warn(line);
      return;
    }
    console.log(line);
  }
}

export function parseLogLevel(value: string | undefined): LogLevel {
  if (value === "debug" || value === "info" || value === "warn") {
    return value;
  }
  return "info";
}
