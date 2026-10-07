import { sanitizeForLog, scrubString } from "./redact";

type Level = "debug" | "info" | "warn" | "error";

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

function minLevel(): Level {
  const raw = process.env.LOG_LEVEL;
  return raw === "debug" || raw === "info" || raw === "warn" || raw === "error" ? raw : "info";
}

/**
 * Serializes the context for one log line. Errors keep their message and stack
 * (instead of "{}"), and EVERYTHING passes through the privacy sanitizer: no
 * transcript text, no recording-URL query strings, no full phone numbers.
 */
function serialize(context: Record<string, unknown> | undefined): string {
  if (!context) return "";
  const withErrors = Object.fromEntries(
    Object.entries(context).map(([k, v]) =>
      v instanceof Error ? [k, { name: v.name, message: v.message, stack: v.stack }] : [k, v],
    ),
  );
  return ` ${JSON.stringify(sanitizeForLog(withErrors))}`;
}

/** Tiny structured logger. One scope per module, e.g. `createLogger("worker")`. */
export function createLogger(scope: string): Logger {
  const write = (level: Level, message: string, context?: Record<string, unknown>) => {
    if (ORDER[level] < ORDER[minLevel()]) return;
    const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${scrubString(message)}${serialize(context)}`;
    (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
  };
  return {
    debug: (m, c) => write("debug", m, c),
    info: (m, c) => write("info", m, c),
    warn: (m, c) => write("warn", m, c),
    error: (m, c) => write("error", m, c),
  };
}
