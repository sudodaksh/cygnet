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

// Utility
export type MaybePromise<T> = T | Promise<T>;
