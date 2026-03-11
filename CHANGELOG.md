# cygnet changelog

## 0.3.1

### Patch Changes

- e3b009c: Ignore the bot's own outgoing and sync updates by default, aligning cygnet with grammY/Telegram-style bot behavior and preventing self-reply loops in scenes and other handlers.

  Also cleans up the examples by removing the temporary voice transcriber example and relying on the new core behavior instead of per-example self-message guards.

## 0.3.0

### Minor Changes

- 42ee843: ### Signal Polls

  Full poll lifecycle support — create, vote, and close polls via `api.createPoll()`, `api.voteInPoll()`, and `api.closePoll()`, with matching convenience methods on the context. Three new filter queries: `message:poll_create`, `message:poll_vote`, and `message:poll_close`, each with compile-time type narrowing.

  ### Webhook Transport

  New `"webhook"` transport option. `WebhookListener` starts an HTTP server that receives POSTs from signal-cli-rest-api's `RECEIVE_WEBHOOK_URL` mode. Zero external dependencies. Accepts both raw JSON-RPC wrapped payloads and plain `RawUpdate` objects.

  ### Link Previews

  Added `linkPreview` option to `SendOptions` for attaching URL previews (title, description, thumbnail) when sending messages.

  ### Contacts API

  New methods: `listContacts()`, `getContact()`, `updateContact()`, and `getContactAvatar()` for reading and managing Signal contacts.

  ### Bug Fixes

  - Fixed command regex silently dropping multi-line arguments — `.*` replaced with `[\s\S]*` so commands like `/code` correctly capture text containing newlines.
  - Fixed webhook handler rejecting all messages from signal-cli-rest-api due to unexpected JSON-RPC wrapper around the payload.

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
