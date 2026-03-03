// Core
export { Bot } from "./bot.ts";
export type { BotConfig } from "./bot.ts";

export { Composer, flatten, concat, run } from "./composer.ts";
export type {
  ChatTypeContext,
  Middleware,
  MiddlewareFn,
  MiddlewareObj,
  NextFunction,
  Trigger,
} from "./composer.ts";

export { Context } from "./context.ts";
export {
  primeGroupStateCache,
  restoreGroupStateCache,
  snapshotGroupStateCache,
} from "./context.ts";
export type {
  GroupStateSnapshot,
  GroupStateSnapshotEntry,
  GroupUpdateDetails,
  GroupUpdateKind,
} from "./context.ts";

// Filters
export { matchFilter } from "./filter.ts";
export type { FilterQuery, Filter } from "./filter.ts";

// API / transport
export { SignalAPI } from "./core/api.ts";
export { HttpClient } from "./core/client.ts";
export { WebSocketListener } from "./core/websocket.ts";
export { WebhookListener } from "./core/webhook.ts";
export { PollingListener } from "./core/polling.ts";
export type { UpdateSource } from "./core/source.ts";
export type { ClientConfig } from "./core/client.ts";
export type { WebhookListenerOptions } from "./core/webhook.ts";

// Errors
export { BotError, SignalError, CygnetError } from "./core/error.ts";

// Logger
export { createLogger, defaultLogger } from "./core/logger.ts";
export type { Logger, LogLevel } from "./core/logger.ts";

// Session
export { session, MemoryStorage, FileStorage, enhanceStorage } from "./convenience/session.ts";
export type {
  DirectStorageAdapter,
  EnhanceStorageOptions,
  EnhancedEntry,
  SessionFlavor,
  SessionOptions,
  StorageAdapter,
} from "./convenience/session.ts";
export { directStorageBrand } from "./convenience/session.ts";

// Attachments
export { encodeAttachment, encodeAttachmentBuffer } from "./convenience/attachments.ts";
export type { EncodeAttachmentOptions } from "./convenience/attachments.ts";

// Scenes
export { BaseScene, Stage, WizardScene } from "./convenience/scenes/index.ts";
export type {
  SceneContextFlavor,
  WizardContextFlavor,
  SceneController,
  WizardController,
  SceneSessionData,
  SceneContext,
  WizardContext,
} from "./convenience/scenes/index.ts";

// Raw Signal types
export type {
  RawUpdate,
  Envelope,
  DataMessage,
  SyncMessage,
  EditMessage,
  DeleteMessage,
  ReceiptMessage,
  TypingMessage,
  CallMessage,
  Reaction,
  Quote,
  Mention,
  Attachment,
  Sticker,
  GroupInfo,
  Group,
  GroupMember,
  SendOptions,
  SendResult,
  LinkPreview,
  SendReactionPayload,
  QuoteOptions,
  MentionOptions,
  CreateGroupOptions,
  UpdateGroupOptions,
  GroupPermissions,
  GroupLinkState,
  UpdateProfileOptions,
  Contact,
  ContactProfile,
  ContactNickname,
  UpdateContactOptions,
  PollCreate,
  PollVote,
  PollTerminate,
  CreatePollPayload,
  VotePollPayload,
  CreatePollResult,
  MaybePromise,
} from "./types.ts";
