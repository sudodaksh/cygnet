import type { SignalAPI } from "./core/api.ts";
import type {
  CallMessage,
  DataMessage,
  DeleteMessage,
  EditMessage,
  MaybePromise,
  RawUpdate,
  Reaction,
  ReceiptMessage,
  SendOptions,
  SyncMessage,
  TypingMessage,
} from "./types.ts";

export class Context {
  /** The raw update from signal-cli-rest-api */
  readonly update: RawUpdate;
  /** The Signal API client */
  readonly api: SignalAPI;
  /** The bot's own phone number */
  readonly me: string;

  /**
   * Optional: set by hears() / regex triggers.
   * Holds the RegExpExecArray when a RegExp trigger matched.
   */
  match?: RegExpExecArray | null;

  constructor(update: RawUpdate, api: SignalAPI, me: string) {
    this.update = update;
    this.api = api;
    this.me = me;
  }

  // --- Update-type getters ---

  /** The DataMessage if this update is a data message (includes reactions). */
  get dataMessage(): DataMessage | undefined {
    return this.update.envelope.dataMessage;
  }

  /** The SyncMessage if this update is a sync message from a linked device. */
  get syncMessage(): SyncMessage | undefined {
    return this.update.envelope.syncMessage;
  }

  /** The EditMessage if this update is an edit. */
  get editMessage(): EditMessage | undefined {
    return this.update.envelope.editMessage;
  }

  /** The DeleteMessage if this update is a deletion. */
  get deleteMessage(): DeleteMessage | undefined {
    return this.update.envelope.deleteMessage;
  }

  /** The ReceiptMessage if this update is a read/delivery receipt. */
  get receipt(): ReceiptMessage | undefined {
    return this.update.envelope.receiptMessage;
  }

  /** The TypingMessage if this update is a typing indicator. */
  get typingMessage(): TypingMessage | undefined {
    return this.update.envelope.typingMessage;
  }

  /** The CallMessage if this update is a call. */
  get callMessage(): CallMessage | undefined {
    return this.update.envelope.callMessage;
  }

  // --- Computed shortcuts ---

  /**
   * The DataMessage for regular messages (NOT reactions).
   * Undefined if this update is a reaction or not a data message.
   */
  get message(): DataMessage | undefined {
    const dm = this.update.envelope.dataMessage;
    return dm && !dm.reaction ? dm : undefined;
  }

  /**
   * The Reaction if this DataMessage is a reaction.
   * Undefined otherwise.
   */
  get reaction(): Reaction | undefined {
    const dm = this.update.envelope.dataMessage;
    return dm?.reaction ?? undefined;
  }

  /** The sender's phone number (e.g. "+491234567890"). May be null if sender hides their number. */
  get from(): string | undefined {
    return this.update.envelope.sourceNumber || undefined;
  }

  /** The sender's UUID. */
  get fromUuid(): string | undefined {
    return this.update.envelope.sourceUuid || this.update.envelope.source || undefined;
  }

  /** The sender's display name. */
  get fromName(): string | undefined {
    return this.update.envelope.sourceName || undefined;
  }

  /**
   * The recipient for replies: the group ID if this is a group message,
   * otherwise the sender's phone number or UUID.
   */
  get chat(): string {
    const dm = this.update.envelope.dataMessage;
    if (dm?.groupInfo?.groupId) return dm.groupInfo.groupId;
    const em = this.update.envelope.editMessage;
    if (em?.message?.groupInfo?.groupId) return em.message.groupInfo.groupId;
    const typing = this.update.envelope.typingMessage;
    if (typing?.groupId) return typing.groupId;
    return this.update.envelope.sourceNumber || this.update.envelope.source;
  }

  /** True if the message is from a group. */
  get isGroup(): boolean {
    return (
      this.update.envelope.dataMessage?.groupInfo != null ||
      this.update.envelope.editMessage?.message?.groupInfo != null
    );
  }

  /** The text of the current message (DataMessage or EditMessage). */
  get text(): string | undefined {
    const dm = this.update.envelope.dataMessage;
    if (dm && !dm.reaction && typeof dm.message === "string") {
      return dm.message;
    }
    const em = this.update.envelope.editMessage;
    if (em && typeof em.message.message === "string") {
      return em.message.message;
    }
    return undefined;
  }

  /** The timestamp of the current message. */
  get msgTimestamp(): number | undefined {
    return (
      this.update.envelope.dataMessage?.timestamp ??
      this.update.envelope.editMessage?.message?.timestamp ??
      this.update.envelope.timestamp
    );
  }

  // --- API convenience methods ---

  /**
   * Send a reply to the current chat (group or DM).
   */
  async reply(text: string, options: SendOptions = {}): Promise<void> {
    await this.api.send(this.chat, text, options);
  }

  /**
   * Send a reply that quotes the current message.
   */
  async quote(text: string, options: SendOptions = {}): Promise<void> {
    const ts = this.msgTimestamp;
    const author = this.from;
    if (!ts || !author) {
      return this.reply(text, options);
    }
    await this.api.send(this.chat, text, {
      ...options,
      quote: {
        timestamp: ts,
        author,
        text: this.text,
      },
    });
  }

  /**
   * React to the current message with an emoji.
   */
  async react(emoji: string): Promise<void> {
    const ts = this.msgTimestamp;
    const author = this.from;
    if (!ts || !author) throw new Error("Cannot react: no message timestamp or author");
    await this.api.react(this.chat, {
      reaction: emoji,
      targetAuthor: author,
      targetTimestamp: ts,
    });
  }

  /**
   * Remove a reaction from the current message.
   */
  async unreact(emoji: string): Promise<void> {
    const ts = this.msgTimestamp;
    const author = this.from;
    if (!ts || !author) throw new Error("Cannot unreact: no message timestamp or author");
    await this.api.react(this.chat, {
      reaction: emoji,
      targetAuthor: author,
      targetTimestamp: ts,
      isRemove: true,
    });
  }

  /**
   * Send a typing indicator to the current chat.
   * @param stop - If true, send a "stopped typing" indicator (default: false)
   */
  async typing(stop = false): Promise<void> {
    await this.api.typing(this.chat, stop);
  }

  /**
   * Delete a message by timestamp.
   * Defaults to deleting the current message if no timestamp given.
   */
  async deleteMsg(timestamp?: number): Promise<void> {
    const ts = timestamp ?? this.msgTimestamp;
    if (!ts) throw new Error("Cannot delete: no timestamp");
    await this.api.deleteMessage(this.chat, ts);
  }
}

// Allow Context subclasses / mixins (for context flavoring)
export type ContextFlavor<F> = F;
