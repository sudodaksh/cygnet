import type { Context } from "./context.ts";
import type {
  DataMessage,
  DeleteMessage,
  EditMessage,
  Envelope,
  ReceiptMessage,
  SyncMessage,
  TypingMessage,
  CallMessage,
} from "./types.ts";

// --- Filter query string literals ---

export type FilterQuery =
  | "message"         // DataMessage that is NOT a reaction
  | "message:text"    // DataMessage with non-null text (and NOT a reaction)
  | "message:attachments" // DataMessage with at least one attachment
  | "message:quote"   // DataMessage with a quote
  | "message:reaction" // DataMessage where reaction != null
  | "message:group"   // DataMessage from a group
  | "message:private" // DataMessage from a 1-on-1 (no group)
  | "message:sticker" // DataMessage with a sticker
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
    case "message":
      return env.dataMessage != null && !env.dataMessage.reaction;
    case "message:text":
      return (
        env.dataMessage != null &&
        !env.dataMessage.reaction &&
        typeof env.dataMessage.message === "string" &&
        env.dataMessage.message.length > 0
      );
    case "message:attachments":
      return (
        env.dataMessage != null &&
        (env.dataMessage.attachments?.length ?? 0) > 0
      );
    case "message:quote":
      return env.dataMessage != null && env.dataMessage.quote != null;
    case "message:reaction":
      return env.dataMessage != null && env.dataMessage.reaction != null;
    case "message:group":
      return env.dataMessage != null && env.dataMessage.groupInfo != null;
    case "message:private":
      return env.dataMessage != null && env.dataMessage.groupInfo == null;
    case "message:sticker":
      return env.dataMessage != null && env.dataMessage.sticker != null;
    case "edit_message":
      return env.editMessage != null;
    case "delete_message":
      return env.deleteMessage != null;
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
    ? C & { update: { envelope: Envelope & { dataMessage: DataMessage & { reaction: undefined } } } }
  : Q extends "message:text"
    ? C & { update: { envelope: Envelope & { dataMessage: DataMessage & { reaction: undefined; message: string } } } }
  : Q extends "message:attachments"
    ? C & { update: { envelope: Envelope & { dataMessage: DataMessage } } }
  : Q extends "message:quote"
    ? C & { update: { envelope: Envelope & { dataMessage: DataMessage & { quote: NonNullable<DataMessage["quote"]> } } } }
  : Q extends "message:reaction"
    ? C & { update: { envelope: Envelope & { dataMessage: DataMessage & { reaction: NonNullable<DataMessage["reaction"]> } } } }
  : Q extends "message:group"
    ? C & { update: { envelope: Envelope & { dataMessage: DataMessage & { groupInfo: NonNullable<DataMessage["groupInfo"]> } } } }
  : Q extends "message:private"
    ? C & { update: { envelope: Envelope & { dataMessage: DataMessage & { groupInfo: undefined } } } }
  : Q extends "message:sticker"
    ? C & { update: { envelope: Envelope & { dataMessage: DataMessage & { sticker: NonNullable<DataMessage["sticker"]> } } } }
  : Q extends "edit_message"
    ? C & { update: { envelope: Envelope & { editMessage: EditMessage } } }
  : Q extends "delete_message"
    ? C & { update: { envelope: Envelope & { deleteMessage: DeleteMessage } } }
  : Q extends "receipt"
    ? C & { update: { envelope: Envelope & { receiptMessage: ReceiptMessage } } }
  : Q extends "typing"
    ? C & { update: { envelope: Envelope & { typingMessage: TypingMessage } } }
  : Q extends "call"
    ? C & { update: { envelope: Envelope & { callMessage: CallMessage } } }
  : Q extends "sync_message"
    ? C & { update: { envelope: Envelope & { syncMessage: SyncMessage } } }
  : C;
