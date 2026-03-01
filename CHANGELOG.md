# cygnet changelog

## 0.2.1

### Patch Changes

- aad74eb: ### Structured logging system

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

## 0.2.0

### Minor Changes

- 9a7578e: Added major feature coverage across attachments, groups, and profiles.

  - Added full attachment lifecycle support:
    - Receive convenience via `ctx.attachments`
    - Download helpers via `ctx.downloadAttachment()` and `api.downloadAttachment()`
    - Attachment listing/deletion via `api.listAttachments()` and `api.deleteAttachment()`
    - New encoding helpers: `encodeAttachment()` and `encodeAttachmentBuffer()`
    - Improved `"message:attachments"` filter narrowing for safer TypeScript usage
  - Added comprehensive group management APIs:
    - Create/get/update groups
    - Add/remove members and admins
    - Join/leave/block group operations
    - Group avatar fetch
    - Expanded group-management example commands
  - Added profile update support via `api.updateProfile()` with typed options
  - Added release automation scaffolding (CI, Changesets workflow, guarded npm publish workflow) and release documentation

All notable changes to this project will be documented in this file.

The format follows [Changesets](https://github.com/changesets/changesets).
