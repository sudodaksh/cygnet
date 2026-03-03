// Raw types from signal-cli-rest-api WebSocket and HTTP responses

export interface RawUpdate {
  envelope: Envelope;
  account: string; // bot's own phone number
}

export interface Envelope {
  source: string; // sender UUID (or phone number in older versions)
  sourceNumber: string | null; // sender phone number e.g. "+491234567890"
  sourceUuid: string;
  sourceName: string;
  sourceDevice: number;
  timestamp: number; // Unix ms
  serverReceivedTimestamp?: number;
  serverDeliveredTimestamp?: number;
  dataMessage?: DataMessage;
  syncMessage?: SyncMessage;
  editMessage?: EditMessage;
  deleteMessage?: DeleteMessage;
  receiptMessage?: ReceiptMessage;
  typingMessage?: TypingMessage;
  callMessage?: CallMessage;
}

export interface DataMessage {
  timestamp: number;
  message: string | null;
  groupInfo?: GroupInfo;
  attachments?: Attachment[];
  mentions?: Mention[];
  quote?: Quote;
  reaction?: Reaction; // present = this DataMessage IS a reaction
  sticker?: Sticker;
  remoteDelete?: { timestamp: number }; // present = this is a remote delete for the message with this timestamp
  pollCreate?: PollCreate;
  pollVote?: PollVote;
  pollTerminate?: PollTerminate;
  expiresInSeconds: number;
  viewOnce: boolean;
  isExpirationUpdate?: boolean;
}

export interface GroupInfo {
  groupId: string;
  groupName?: string;
  revision?: number;
  type: string; // "DELIVER" | "UPDATE" | "QUIT" | "UNKNOWN"
}

export interface Reaction {
  emoji: string;
  targetAuthor: string; // UUID (or phone in older versions)
  targetAuthorNumber: string | null; // phone number (can be null)
  targetAuthorUuid: string;
  targetSentTimestamp: number;
  isRemove: boolean;
}

export interface Quote {
  id: number; // timestamp of quoted message
  author: string; // phone number
  authorUuid: string;
  text: string | null;
  attachments: Attachment[];
  mentions: Mention[];
}

export interface Mention {
  name: string;
  number: string; // phone number
  uuid: string;
  start: number;
  length: number;
}

export interface Attachment {
  contentType: string;
  filename: string | null;
  id: string;
  size: number;
  width?: number;
  height?: number;
  caption?: string;
  uploadTimestamp?: number;
}

export interface Sticker {
  packId: string;
  stickerId: number;
}

export interface SyncMessage {
  sentMessage?: SentSyncMessage;
  readMessages?: ReadSyncMessage[];
  viewedMessages?: ViewedSyncMessage[];
  contacts?: unknown;
}

export interface SentSyncMessage {
  timestamp: number;
  message: string | null;
  destination: string | null;
  destinationUuid: string | null;
  groupInfo?: GroupInfo;
  attachments: Attachment[];
  mentions: Mention[];
  quote: Quote | null;
}

export interface ReadSyncMessage {
  sender: string;
  senderUuid: string;
  timestamp: number;
}

export interface ViewedSyncMessage {
  sender: string;
  senderUuid: string;
  timestamp: number;
}

export interface EditMessage {
  targetSentTimestamp: number;
  dataMessage: DataMessage;
}

export interface DeleteMessage {
  targetSentTimestamp: number;
}

export interface ReceiptMessage {
  when: number;
  isDelivery: boolean;
  isRead: boolean;
  isViewed: boolean;
  timestamps: number[];
}

export interface TypingMessage {
  action: "STARTED" | "STOPPED";
  timestamp: number;
  groupId?: string;
}

export interface CallMessage {
  offerMessage?: { id: number; type: string };
  answerMessage?: { id: number };
  busyMessage?: { id: number };
  hangupMessage?: { id: number; type: string };
  iceUpdateMessages?: unknown[];
}

export interface Group {
  id: string;
  name: string;
  description: string;
  revision?: number;
  /**
   * signal-cli-rest-api commonly returns flat string identifiers here
   * (phone numbers and/or UUIDs), not structured GroupMember objects.
   */
  members: string[] | GroupMember[];
  pending_invites?: string[];
  pending_requests?: string[];
  admins?: string[] | GroupMember[];
  blocked?: boolean;
  invite_link?: string;
  internal_id?: string;
  // Older/alternate response shapes
  isMember?: boolean;
  isBlocked?: boolean;
  pendingMembers?: GroupMember[];
  requestingMembers?: GroupMember[];
  groupInviteLink?: string | null;
  messageExpirationTime?: number;
  isAnnouncementGroup?: boolean;
}

export interface GroupMember {
  number: string;
  uuid: string;
  profileKey?: string;
}

// --- Send types ---

export interface SendOptions {
  /** Base64-encoded attachments */
  base64Attachments?: string[];
  /** Quote a previous message */
  quote?: QuoteOptions;
  /** Mentions in the text */
  mentions?: MentionOptions[];
  /** "normal" or "styled" */
  textMode?: "normal" | "styled";
  viewOnce?: boolean;
  /** Timestamp of a previously sent message to edit */
  editTimestamp?: number;
  /**
   * Attach a link preview to the message.
   * The `url` must start with `https://` and must appear in the message text.
   */
  linkPreview?: LinkPreview;
}

export interface LinkPreview {
  /** URL to preview. Must start with "https://" and appear in the message text. */
  url: string;
  /** Title shown in the preview card. Required. */
  title: string;
  /** Optional description shown below the title. */
  description?: string;
  /** Optional base64-encoded thumbnail image (data URI or raw base64). */
  base64Thumbnail?: string;
}

export interface QuoteOptions {
  /** Timestamp of the message being quoted */
  timestamp: number;
  /** Author phone number */
  author: string;
  /** Text of the quoted message */
  text?: string;
  mentions?: MentionOptions[];
}

export interface MentionOptions {
  number: string;
  start: number;
  length: number;
}

export interface SendResult {
  timestamp: number;
  results?: SendRecipientResult[];
}

export interface SendRecipientResult {
  recipientAddress: { uuid: string; number: string };
  status: "SUCCESS" | "UNKNOWN_ERROR" | string;
  networkFailure: boolean;
  unregisteredFailure: boolean;
}

export interface SendReactionPayload {
  reaction: string;
  targetAuthor: string;
  targetTimestamp: number;
  isRemove?: boolean;
}

// --- Group management types ---

export type GroupLinkState = "disabled" | "enabled" | "enabled-with-approval";

export interface GroupPermissions {
  editGroupPermission?: "every-member" | "only-admins";
  addMembersPermission?: "every-member" | "only-admins";
  sendMessagesPermission?: "every-member" | "only-admins";
}

export interface CreateGroupOptions {
  name: string;
  members: string[];
  description?: string;
  base64Avatar?: string;
  expirationTime?: number;
  groupLinkState?: GroupLinkState;
  permissions?: GroupPermissions;
}

export interface UpdateGroupOptions {
  name?: string;
  description?: string;
  base64Avatar?: string;
  expirationTime?: number;
  groupLinkState?: GroupLinkState;
  permissions?: GroupPermissions;
}

// --- Profile types ---

export interface UpdateProfileOptions {
  name: string;
  base64Avatar?: string;
  about?: string;
}

// --- Contact types ---

export interface ContactProfile {
  givenName: string;
  familyName: string;
  about: string;
  hasAvatar: boolean;
  lastUpdatedTimestamp: number;
}

export interface ContactNickname {
  name: string;
  givenName: string;
  familyName: string;
}

export interface Contact {
  number: string;
  uuid: string;
  /** Contact name (set by the bot/user, not the profile name). */
  name: string;
  /** The contact's Signal profile name. */
  profileName: string;
  username: string;
  color: string;
  blocked: boolean;
  messageExpiration: string;
  note: string;
  profile: ContactProfile;
  givenName: string;
  nickname: ContactNickname;
}

export interface UpdateContactOptions {
  /** The recipient's phone number, UUID, or username. */
  recipient: string;
  /** Contact display name. */
  name?: string;
  /** Disappearing message timer in seconds. */
  expirationInSeconds?: number;
}

// --- Poll types (incoming) ---

/** Received when someone creates a poll. Carried on DataMessage. */
export interface PollCreate {
  question: string;
  allowMultiple: boolean;
  options: string[];
}

/**
 * Received when someone votes in a poll. Carried on DataMessage.
 * The voter is `envelope.source*`; the poll creator is `author*`.
 * `optionIndexes` are 0-based indices into the original `PollCreate.options`.
 */
export interface PollVote {
  /** @deprecated Use authorNumber or authorUuid instead. */
  author: string;
  authorNumber: string | null;
  authorUuid: string;
  /** Timestamp of the original poll creation message. */
  targetSentTimestamp: number;
  /** 0-based indices of the selected options. */
  optionIndexes: number[];
  voteCount: number;
}

/** Received when a poll is closed/terminated. Carried on DataMessage. */
export interface PollTerminate {
  /** Timestamp of the original poll creation message. */
  targetSentTimestamp: number;
}

// --- Poll types (outgoing / API payloads) ---

export interface CreatePollPayload {
  question: string;
  answers: string[];
  /** Allow voters to select multiple options. Default: true. */
  allowMultipleSelections?: boolean;
}

export interface VotePollPayload {
  /** The poll creator's phone number or UUID. */
  pollAuthor: string;
  /** Timestamp of the poll creation message. */
  pollTimestamp: number;
  /** 1-based indices of the selected answers (the REST API uses 1-based). */
  selectedAnswers: number[];
}

export interface CreatePollResult {
  timestamp: number;
}

// Utility
export type MaybePromise<T> = T | Promise<T>;
