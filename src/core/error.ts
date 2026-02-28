import type { Context } from "../context.ts";

export class BotError<C extends Context = Context> extends Error {
  constructor(
    readonly error: unknown,
    readonly ctx: C,
  ) {
    super(
      `Bot error caused by update (${getUpdateType(ctx.update.envelope)}): ${
        error instanceof Error ? error.message : String(error)
      }`,
      error instanceof Error ? { cause: error } : undefined,
    );
    this.name = "BotError";
  }
}

export class SignalError extends Error {
  constructor(
    readonly statusCode: number,
    readonly description: string,
  ) {
    super(`Signal API error ${statusCode}: ${description}`);
    this.name = "SignalError";
  }
}

function getUpdateType(envelope: { dataMessage?: unknown; syncMessage?: unknown; editMessage?: unknown; deleteMessage?: unknown; receiptMessage?: unknown; typingMessage?: unknown; callMessage?: unknown }): string {
  if (envelope.dataMessage) return "dataMessage";
  if (envelope.syncMessage) return "syncMessage";
  if (envelope.editMessage) return "editMessage";
  if (envelope.deleteMessage) return "deleteMessage";
  if (envelope.receiptMessage) return "receiptMessage";
  if (envelope.typingMessage) return "typingMessage";
  if (envelope.callMessage) return "callMessage";
  return "unknown";
}
