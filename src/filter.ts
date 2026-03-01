import type { Context } from "./context.ts";
import type {
  Attachment,
  DataMessage,
  DeleteMessage,
  EditMessage,
  Envelope,
  GroupInfo,
  Reaction,
  ReceiptMessage,
  SyncMessage,
  TypingMessage,
  CallMessage,
} from "./types.ts";

// --- Filter query string literals ---

export type FilterQuery =
  | "message"         // DataMessage that is NOT a reaction or group update
  | "message:text"    // DataMessage with non-null text (and NOT a reaction)
  | "message:attachments" // DataMessage with at least one attachment
  | "message:quote"   // DataMessage with a quote
  | "message:reaction" // DataMessage where reaction != null
  | "message:group"   // DataMessage from a group (excludes group updates)
  | "message:private" // DataMessage from a 1-on-1 (no group)
  | "message:sticker" // DataMessage with a sticker
  | "group_update"    // Group metadata/membership change (join, leave, rename, etc.)
  | "edit_message"    // EditMessage
  | "delete_message"  // DeleteMessage
  | "receipt"         // ReceiptMessage
  | "typing"          // TypingMessage
  | "call"            // CallMessage
  | "sync_message";   // SyncMessage

// --- Runtime matching ---

export function matchFilter(ctx: Context, query: FilterQuery): boolean {
  const env = ctx.update.envelope;
  switch (query) {
    case "message": {
      const dm = env.dataMessage;
      return dm != null && !dm.reaction && !dm.remoteDelete && dm.groupInfo?.type !== "UPDATE";
    }
    case "message:text": {
      const dm = env.dataMessage;
      return dm != null && !dm.reaction && !dm.remoteDelete && typeof dm.message === "string" && dm.message.length > 0;
    }
    case "message:attachments": {
      const dm = env.dataMessage;
      return dm != null && !dm.reaction && !dm.remoteDelete && (dm.attachments?.length ?? 0) > 0;
    }
    case "message:quote":
      return env.dataMessage != null && !env.dataMessage.reaction && !env.dataMessage.remoteDelete && env.dataMessage.quote != null;
    case "message:reaction":
      return env.dataMessage != null && env.dataMessage.reaction != null;
    case "message:group": {
      const dm = env.dataMessage;
      return dm != null && !dm.reaction && !dm.remoteDelete && dm.groupInfo != null && dm.groupInfo.type !== "UPDATE";
    }
    case "message:private":
      return env.dataMessage != null && !env.dataMessage.reaction && !env.dataMessage.remoteDelete && env.dataMessage.groupInfo == null;
    case "group_update":
      return env.dataMessage != null && env.dataMessage.groupInfo?.type === "UPDATE";
    case "message:sticker":
      return env.dataMessage != null && !env.dataMessage.reaction && !env.dataMessage.remoteDelete && env.dataMessage.sticker != null;
    case "edit_message":
      return env.editMessage != null;
    case "delete_message":
      return (env.dataMessage?.remoteDelete != null) || (env.deleteMessage != null);
    case "receipt":
      return env.receiptMessage != null;
    case "typing":
      return env.typingMessage != null;
    case "call":
      return env.callMessage != null;
    case "sync_message":
      return env.syncMessage != null;
    default:
      return false;
  }
}

// --- Compile-time type narrowing ---

/**
 * Narrows the Context type based on the FilterQuery.
 * After `.on("message:text")`, TypeScript knows ctx.text is `string`.
 */
export type Filter<C extends Context, Q extends FilterQuery> =
  Q extends "message"
    ? C & {
        update: { envelope: Envelope & { dataMessage: DataMessage & { reaction: undefined } } };
        dataMessage: DataMessage;
        message: DataMessage;
        msgTimestamp: number;
      }
  : Q extends "message:text"
    ? C & {
        update: { envelope: Envelope & { dataMessage: DataMessage & { reaction: undefined; message: string } } };
        dataMessage: DataMessage;
        message: DataMessage;
        msgTimestamp: number;
      }
  : Q extends "message:attachments"
    ? C & {
        update: { envelope: Envelope & { dataMessage: DataMessage & { reaction: undefined; attachments: Attachment[] } } };
        dataMessage: DataMessage;
        message: DataMessage;
        attachments: Attachment[];
        msgTimestamp: number;
      }
  : Q extends "message:quote"
    ? C & {
        update: { envelope: Envelope & { dataMessage: DataMessage & { reaction: undefined; quote: NonNullable<DataMessage["quote"]> } } };
        dataMessage: DataMessage;
        message: DataMessage;
        msgTimestamp: number;
      }
  : Q extends "message:reaction"
    ? C & {
        update: { envelope: Envelope & { dataMessage: DataMessage & { reaction: NonNullable<DataMessage["reaction"]> } } };
        dataMessage: DataMessage;
        reaction: Reaction;
        msgTimestamp: number;
      }
  : Q extends "message:group"
    ? C & {
        update: { envelope: Envelope & { dataMessage: DataMessage & { reaction: undefined; groupInfo: NonNullable<DataMessage["groupInfo"]> } } };
        dataMessage: DataMessage;
        message: DataMessage;
        isGroup: true;
        msgTimestamp: number;
      }
  : Q extends "message:private"
    ? C & {
        update: { envelope: Envelope & { dataMessage: DataMessage & { reaction: undefined; groupInfo: undefined } } };
        dataMessage: DataMessage;
        message: DataMessage;
        isGroup: false;
        msgTimestamp: number;
      }
  : Q extends "message:sticker"
    ? C & {
        update: { envelope: Envelope & { dataMessage: DataMessage & { reaction: undefined; sticker: NonNullable<DataMessage["sticker"]> } } };
        dataMessage: DataMessage;
        message: DataMessage;
        msgTimestamp: number;
      }
  : Q extends "group_update"
    ? C & {
        update: { envelope: Envelope & { dataMessage: DataMessage & { groupInfo: GroupInfo & { type: "UPDATE" } } } };
        dataMessage: DataMessage;
        groupUpdate: DataMessage & { groupInfo: GroupInfo & { type: "UPDATE" } };
        isGroup: true;
        msgTimestamp: number;
      }
  : Q extends "edit_message"
    ? C & {
        update: { envelope: Envelope & { editMessage: EditMessage } };
        editMessage: EditMessage;
        msgTimestamp: number;
      }
  : Q extends "delete_message"
    ? C & {
        update: { envelope: Envelope & { deleteMessage: DeleteMessage } };
        deleteMessage: DeleteMessage;
      }
  : Q extends "receipt"
    ? C & {
        update: { envelope: Envelope & { receiptMessage: ReceiptMessage } };
        receipt: ReceiptMessage;
      }
  : Q extends "typing"
    ? C & {
        update: { envelope: Envelope & { typingMessage: TypingMessage } };
        typingMessage: TypingMessage;
      }
  : Q extends "call"
    ? C & {
        update: { envelope: Envelope & { callMessage: CallMessage } };
        callMessage: CallMessage;
      }
  : Q extends "sync_message"
    ? C & {
        update: { envelope: Envelope & { syncMessage: SyncMessage } };
        syncMessage: SyncMessage;
      }
  : C;
