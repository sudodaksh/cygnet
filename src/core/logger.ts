/**
 * Logging infrastructure for cygnet.
 *
 * Design follows the Fastify/Pino pattern:
 * - A minimal `Logger` interface that users can implement with any backend
 * - A built-in pretty logger with level filtering and optional color
 * - Configurable via `BotConfig.logLevel` or by passing a custom `Logger`
 *
 * The default logger is silent at "debug" level and outputs to stderr/stdout
 * with colored `[cygnet]` prefixes when running in a TTY.
 */

// --- Public types ---

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

/**
 * Logger interface compatible with pino, consola, and similar libraries.
 * Pass any object that implements these four methods to `BotConfig.logger`.
 */
export interface Logger {
  debug(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

// --- Level priority ---

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

// --- Color support detection ---

function detectColorSupport(): boolean {
  try {
    if (typeof process === "undefined") return false;
    if (process.env?.NO_COLOR) return false;
    if (process.env?.FORCE_COLOR) return true;
    // Check stderr since warn/error write there
    return !!process.stderr?.isTTY;
  } catch {
    return false;
  }
}

const USE_COLOR = detectColorSupport();

const ansi = USE_COLOR
  ? {
      reset: "\x1b[0m",
      dim: "\x1b[2m",
      bold: "\x1b[1m",
      red: "\x1b[31m",
      yellow: "\x1b[33m",
      cyan: "\x1b[36m",
      gray: "\x1b[90m",
    }
  : {
      reset: "",
      dim: "",
      bold: "",
      red: "",
      yellow: "",
      cyan: "",
      gray: "",
    };

// --- Formatting ---

/**
 * Format extra arguments for log output.
 * Errors are reduced to their message (no stack trace in logs).
 */
function formatExtra(args: unknown[]): string {
  if (args.length === 0) return "";
  const parts = args.map((a) => {
    if (a instanceof Error) return a.message;
    if (typeof a === "string") return a;
    if (typeof a === "object" && a !== null) {
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    }
    return String(a);
  });
  return " " + parts.join(" ");
}

// --- Factory ---

/**
 * Create a logger with the given minimum level.
 *
 * Output format:
 * ```
 * [cygnet] Bot started as +49... (websocket)     ← info (cyan)
 * [cygnet] Failed to prime group state cache      ← warn (yellow)
 * [cygnet] Cannot reach signal-cli-rest-api       ← error (red)
 * ```
 */
export function createLogger(level: LogLevel = "info"): Logger {
  const min = LEVEL_PRIORITY[level];

  return {
    debug(msg, ...args) {
      if (min > LEVEL_PRIORITY.debug) return;
      console.debug(
        `${ansi.gray}[cygnet]${ansi.reset} ${ansi.dim}${msg}${formatExtra(args)}${ansi.reset}`,
      );
    },

    info(msg, ...args) {
      if (min > LEVEL_PRIORITY.info) return;
      console.log(
        `${ansi.cyan}[cygnet]${ansi.reset} ${msg}${formatExtra(args)}`,
      );
    },

    warn(msg, ...args) {
      if (min > LEVEL_PRIORITY.warn) return;
      console.warn(
        `${ansi.yellow}[cygnet]${ansi.reset} ${ansi.yellow}${msg}${formatExtra(args)}${ansi.reset}`,
      );
    },

    error(msg, ...args) {
      if (min > LEVEL_PRIORITY.error) return;
      console.error(
        `${ansi.red}[cygnet]${ansi.reset} ${ansi.red}${msg}${formatExtra(args)}${ansi.reset}`,
      );
    },
  };
}

/** Default logger at "info" level. Used internally when no bot-level logger is available. */
export const defaultLogger: Logger = createLogger("info");
