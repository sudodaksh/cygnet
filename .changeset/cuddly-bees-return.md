---
"cygnet": patch
---

### Structured logging system

- Added `Logger` interface compatible with pino, consola, winston, and similar libraries
- Added `createLogger(level)` factory with colored `[cygnet]` output, TTY detection, and `NO_COLOR`/`FORCE_COLOR` support
- New `BotConfig.logLevel` option: `"debug" | "info" | "warn" | "error" | "silent"` (default: `"info"`)
- New `BotConfig.logger` option: bring your own logger instance
- Exposed `bot.logger` for use in middleware
- All internal `console.*` calls replaced with structured logger — zero raw console output in the framework

### Clean error output

- Added `CygnetError` class for lifecycle/config errors with suppressed stack traces
- Config validation in `Bot.init()`: empty `signalService` and `phoneNumber` now produce clear, actionable messages with examples instead of cryptic network errors
- Unhandled rejections from `bot.start()` now print a single clean line instead of a wall of framework internals

### Exports

- New exports: `CygnetError`, `createLogger`, `defaultLogger`, `Logger`, `LogLevel`
