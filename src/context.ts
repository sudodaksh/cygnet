import type { SignalAPI } from "./core/api.ts";
import type {
  Attachment,
  CallMessage,
  DataMessage,
  DeleteMessage,
  EditMessage,
  Group,
  MaybePromise,
  RawUpdate,
  Reaction,
  ReceiptMessage,
  SendOptions,
  SyncMessage,
  TypingMessage,
} from "./types.ts";
import { matchFilter } from "./filter.ts";
import type { FilterQuery, Filter } from "./filter.ts";

export type GroupUpdateKind =
  | "joined"
  | "left"
  | "renamed"
  | "updated"
  | "stale"
  | "unknown";

export interface GroupUpdateDetails {
  kind: GroupUpdateKind;
  groupId: string;
  groupName?: string;
  revision?: number;
  previousName?: string;
  previousRevision?: number;
  missedRevisions?: number;
  currentGroup?: Group;
}

export interface GroupStateSnapshotEntry {
  name?: string;
  isMember: boolean;
  revision?: number;
}

export type GroupStateSnapshot = Record<string, GroupStateSnapshotEntry>;

type CachedGroupState = GroupStateSnapshotEntry;

const groupStateCaches = new Map<string, Map<string, CachedGroupState>>();

function groupHasMember(group: Group, memberId: string): boolean {
  if (group.isMember !== undefined) return group.isMember;

  const members = group.members;
  if (!Array.isArray(members)) return false;

  return members.some((member) =>
    typeof member === "string" ? member === memberId : member.number === memberId || member.uuid === memberId
  );
}

function getGroupStateCache(botId: string): Map<string, CachedGroupState> {
  let cache = groupStateCaches.get(botId);
  if (!cache) {
    cache = new Map<string, CachedGroupState>();
    groupStateCaches.set(botId, cache);
  }
  return cache;
}

export function primeGroupStateCache(botId: string, groups: Group[]): void {
  const cache = getGroupStateCache(botId);
  const seen = new Set<string>();

  for (const group of groups) {
    seen.add(group.id);
    const previous = cache.get(group.id);
    cache.set(group.id, {
      name: group.name,
      isMember: groupHasMember(group, botId),
      revision: group.revision ?? previous?.revision,
    });
  }

  for (const [groupId, previous] of cache) {
    if (!seen.has(groupId) && previous.isMember) {
      cache.set(groupId, {
        ...previous,
        isMember: false,
      });
    }
  }
}

export function restoreGroupStateCache(
  botId: string,
  snapshot: GroupStateSnapshot,
): void {
  const cache = getGroupStateCache(botId);
  for (const [groupId, state] of Object.entries(snapshot)) {
    cache.set(groupId, {
      name: state.name,
      isMember: state.isMember,
      revision: state.revision,
    });
  }
}

export function snapshotGroupStateCache(botId: string): GroupStateSnapshot {
  const cache = getGroupStateCache(botId);
  const snapshot: GroupStateSnapshot = {};

  for (const [groupId, state] of cache) {
    snapshot[groupId] = {
      name: state.name,
      isMember: state.isMember,
      revision: state.revision,
    };
  }

  return snapshot;
}

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
  match?: string | RegExpExecArray;

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
   * Undefined if this update is a reaction, group update, or not a data message.
   */
  get message(): DataMessage | undefined {
    const dm = this.update.envelope.dataMessage;
    return dm && !dm.reaction && !dm.remoteDelete && dm.groupInfo?.type !== "UPDATE" ? dm : undefined;
  }

  /**
   * The Reaction if this DataMessage is a reaction.
   * Undefined otherwise.
   */
  get reaction(): Reaction | undefined {
    const dm = this.update.envelope.dataMessage;
    return dm?.reaction ?? undefined;
  }

  /**
   * The timestamp of the message that was remotely deleted.
   * Undefined if this is not a remote delete event.
   */
  get remoteDeleteTimestamp(): number | undefined {
    return this.update.envelope.dataMessage?.remoteDelete?.timestamp;
  }

  /**
   * The DataMessage for group metadata/membership updates.
   * Undefined for normal messages.
   */
  get groupUpdate(): DataMessage | undefined {
    const dm = this.update.envelope.dataMessage;
    return dm?.groupInfo?.type === "UPDATE" ? dm : undefined;
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
   * The sender's identifier: phone number if available, otherwise UUID.
   * Always returns a value (unlike `from` which is undefined when phone is hidden).
   * Used internally for react/quote/unreact where an author identifier is needed.
   */
  get sender(): string {
    return this.update.envelope.sourceNumber || this.update.envelope.sourceUuid || this.update.envelope.source;
  }

  /**
   * The recipient for replies: the group ID (prefixed with "group.") if this
   * is a group message, otherwise the sender's phone number or UUID.
   * The "group." prefix is used internally by api.ts to distinguish groups
   * from individual recipients.
   */
  get chat(): string {
    const dm = this.update.envelope.dataMessage;
    if (dm?.groupInfo?.groupId) return `group.${btoa(dm.groupInfo.groupId)}`;
    const em = this.update.envelope.editMessage;
    if (em?.dataMessage?.groupInfo?.groupId) return `group.${btoa(em.dataMessage.groupInfo.groupId)}`;
    const typing = this.update.envelope.typingMessage;
    if (typing?.groupId) return `group.${btoa(typing.groupId)}`;
    return this.update.envelope.sourceNumber || this.update.envelope.source;
  }

  /** True if the message is from a group. */
  get isGroup(): boolean {
    return (
      this.update.envelope.dataMessage?.groupInfo != null ||
      this.update.envelope.editMessage?.dataMessage?.groupInfo != null
    );
  }

  /** Attachments on the current message. Empty array if none. */
  get attachments(): Attachment[] {
    return this.message?.attachments ?? this.editMessage?.dataMessage?.attachments ?? [];
  }

  /** The text of the current message (DataMessage or EditMessage). Empty string if none. */
  get text(): string {
    const dm = this.update.envelope.dataMessage;
    if (dm && !dm.reaction && typeof dm.message === "string") {
      return dm.message;
    }
    const em = this.update.envelope.editMessage;
    if (em && typeof em.dataMessage.message === "string") {
      return em.dataMessage.message;
    }
    return "";
  }

  /** The timestamp of the current message. */
  get msgTimestamp(): number | undefined {
    return (
      this.update.envelope.dataMessage?.timestamp ??
      this.update.envelope.editMessage?.dataMessage?.timestamp ??
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
    const author = this.sender;
    if (!ts || !author) {
      return this.reply(text, options);
    }
    await this.api.send(this.chat, text, {
      ...options,
      quote: {
        timestamp: ts,
        author,
        text: this.text || undefined,
      },
    });
  }

  /**
   * React to the current message with an emoji.
   */
  async react(emoji: string): Promise<void> {
    const ts = this.msgTimestamp;
    const author = this.sender;
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
    const author = this.sender;
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

  /**
   * Download a received attachment by ID from signal-cli-rest-api storage.
   * Returns raw bytes as a Uint8Array.
   */
  async downloadAttachment(id: string): Promise<Uint8Array> {
    return this.api.downloadAttachment(id);
  }

  // --- Type guard methods ---

  /**
   * Check if this update matches the given filter query.
   * Narrows the context type in if-blocks.
   *
   * @example
   * if (ctx.has("message:text")) {
   *   ctx.message; // DataMessage (narrowed)
   * }
   */
  has<Q extends FilterQuery>(query: Q): this is Filter<this & Context, Q> {
    return matchFilter(this, query);
  }

  /**
   * Check if this update has text content, optionally matching a trigger.
   * Sets ctx.match on match.
   *
   * @example
   * if (ctx.hasText()) { ... }           // any text
   * if (ctx.hasText("hello")) { ... }    // contains "hello"
   * if (ctx.hasText(/hi (\w+)/)) { ... } // regex, sets ctx.match
   */
  hasText(trigger?: string | RegExp): boolean {
    const text = this.text;
    if (!text) return false;
    if (trigger === undefined) return true;
    if (typeof trigger === "string") {
      if (text.includes(trigger)) {
        this.match = trigger;
        return true;
      }
      return false;
    }
    const m = trigger.exec(text);
    if (m) {
      this.match = m;
      return true;
    }
    return false;
  }

  /**
   * Check if this update is from a group or private chat.
   *
   * @example
   * if (ctx.hasChatType("group")) { ... }
   */
  hasChatType(type: "group" | "private"): boolean {
    return type === "group" ? this.isGroup : !this.isGroup;
  }

  /**
   * Best-effort classification for Signal group updates.
   *
   * signal-cli-rest-api emits all group metadata and membership changes as the
   * same shape: dataMessage + groupInfo.type === "UPDATE". This helper combines
   * the current payload, a probe to api.getGroups(), and a small in-process
   * cache to infer what most likely happened.
   *
   * Caveat: the first UPDATE seen after process start is often "unknown"
   * because there is no prior cached state to compare against.
   */
  async inspectGroupUpdate(): Promise<GroupUpdateDetails | undefined> {
    const update = this.groupUpdate;
    const info = update?.groupInfo;
    if (!update || !info?.groupId) return undefined;

    const groupId = `group.${btoa(info.groupId)}`;
    const cache = getGroupStateCache(this.me);
    const previous = cache.get(groupId);
    const incomingRevision = info.revision;
    const previousRevision = previous?.revision;

    if (
      previousRevision !== undefined &&
      incomingRevision !== undefined &&
      incomingRevision <= previousRevision
    ) {
      return {
        kind: "stale",
        groupId,
        groupName: info.groupName ?? previous?.name,
        revision: incomingRevision,
        previousName: previous?.name,
        previousRevision,
      };
    }

    const hasGap = (
      previousRevision !== undefined &&
      incomingRevision !== undefined &&
      incomingRevision > previousRevision + 1
    );
    if (hasGap) {
      console.warn(
        `[cygnet] Group update gap for ${groupId}: expected revision ${previousRevision + 1}, got ${incomingRevision}`,
      );
    }

    const nameChanged = (
      previous?.name !== undefined &&
      info.groupName !== undefined &&
      previous.name !== info.groupName
    );
    const needsReconcile = hasGap || !previous || !previous.isMember || !nameChanged;

    let currentGroup: Group | undefined;
    if (needsReconcile) {
      try {
        const groups = await this.api.getGroups();
        currentGroup = groups.find((group) => group.id === groupId);
      } catch {
        // If probing fails, fall back to payload + cache only.
      }
    }

    let kind: GroupUpdateKind = "unknown";
    let nextState: CachedGroupState;

    if (!needsReconcile && previous) {
      kind = "renamed";
      nextState = {
        name: info.groupName ?? previous.name,
        isMember: true,
        revision: incomingRevision ?? previousRevision,
      };
    } else if (currentGroup) {
      const isMember = groupHasMember(currentGroup, this.me);
      if (!isMember) {
        kind = previous?.isMember ? "left" : "unknown";
        nextState = {
          name: currentGroup.name || (info.groupName ?? previous?.name),
          isMember: false,
          revision: incomingRevision ?? currentGroup.revision ?? previousRevision,
        };
      } else if (!previous || !previous.isMember) {
        kind = "joined";
        nextState = {
          name: currentGroup.name || info.groupName,
          isMember: true,
          revision: incomingRevision ?? currentGroup.revision ?? previousRevision,
        };
      } else if (nameChanged) {
        kind = "renamed";
        nextState = {
          name: currentGroup.name || info.groupName,
          isMember: true,
          revision: incomingRevision ?? currentGroup.revision ?? previousRevision,
        };
      } else {
        kind = "updated";
        nextState = {
          name: currentGroup.name || (info.groupName ?? previous.name),
          isMember: true,
          revision: incomingRevision ?? currentGroup.revision ?? previousRevision,
        };
      }
    } else if (!previous) {
      nextState = {
        name: info.groupName,
        isMember: false,
        revision: incomingRevision,
      };
    } else if (!previous.isMember) {
      nextState = {
        name: info.groupName ?? previous.name,
        isMember: false,
        revision: incomingRevision ?? previousRevision,
      };
    } else if (nameChanged) {
      kind = "renamed";
      nextState = {
        name: info.groupName ?? previous.name,
        isMember: true,
        revision: incomingRevision ?? previousRevision,
      };
    } else {
      kind = "updated";
      nextState = {
        name: info.groupName ?? previous.name,
        isMember: true,
        revision: incomingRevision ?? previousRevision,
      };
    }

    cache.set(groupId, nextState);

    const missedRevisions = (
      hasGap &&
      previousRevision !== undefined &&
      incomingRevision !== undefined
    )
      ? incomingRevision - previousRevision - 1
      : undefined;

    return {
      kind,
      groupId,
      groupName: currentGroup?.name || nextState.name,
      revision: info.revision,
      previousName: previous?.name,
      previousRevision,
      missedRevisions,
      currentGroup,
    };
  }
}

// Allow Context subclasses / mixins (for context flavoring)
export type ContextFlavor<F> = F;
