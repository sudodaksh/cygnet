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

/**
 * Lifecycle / configuration error.
 *
 * Stack trace is suppressed so that unhandled rejections produce clean,
 * actionable output instead of noisy internal stack frames:
 *
 * ```
 * CygnetError: phoneNumber is required — provide the bot's registered phone number
 * ```
 *
 * Follows the Discord.js pattern of typed error classes for framework-level
 * problems, and the Prisma pattern of clean, human-readable messages.
 */
export class CygnetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CygnetError";
    // Suppress stack: these are config/network errors where the stack adds
    // zero diagnostic value. Keeps unhandled-rejection output clean.
    this.stack = `${this.name}: ${this.message}`;
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
