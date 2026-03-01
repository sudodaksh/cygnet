import { HttpClient, type ClientConfig } from "./client.ts";
import type {
  Group,
  SendOptions,
  SendReactionPayload,
  SendResult,
} from "../types.ts";

export class SignalAPI {
  readonly #client: HttpClient;

  constructor(config: ClientConfig) {
    this.#client = new HttpClient(config);
  }

  get phoneNumber(): string {
    return this.#client.phoneNumber;
  }

  /** Check signal-cli-rest-api health. Returns true if healthy. */
  async checkHealth(): Promise<boolean> {
    try {
      await this.#client.get("/v1/health");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Send a message. `recipient` is either a phone number ("+491234567890"),
   * a UUID, or a group ID ("group.base64...").
   */
  async send(
    recipient: string,
    text: string,
    options: SendOptions = {},
  ): Promise<SendResult> {
    const payload: Record<string, unknown> = {
      number: this.#client.phoneNumber,
      message: text,
      recipients: [recipient],
    };

    if (options.base64Attachments?.length) {
      payload.base64_attachments = options.base64Attachments;
    }
    if (options.quote) {
      payload.quote_timestamp = options.quote.timestamp;
      payload.quote_author = options.quote.author;
      if (options.quote.text !== undefined) payload.quote_message = options.quote.text;
      if (options.quote.mentions?.length) payload.quote_mentions = options.quote.mentions;
    }
    if (options.mentions?.length) {
      payload.mentions = options.mentions;
    }
    if (options.textMode) {
      payload.text_mode = options.textMode;
    }
    if (options.viewOnce) {
      payload.view_once = options.viewOnce;
    }
    if (options.editTimestamp !== undefined) {
      payload.edit_timestamp = options.editTimestamp;
    }

    return this.#client.post<SendResult>("/v2/send", payload);
  }

  /** Send or remove a reaction on a message. */
  async react(
    recipient: string,
    reaction: SendReactionPayload,
  ): Promise<void> {
    const payload: Record<string, unknown> = {
      recipient,
      reaction: reaction.reaction,
      target_author: reaction.targetAuthor,
      timestamp: reaction.targetTimestamp,
    };
    const path = `/v1/reactions/${encodeURIComponent(this.#client.phoneNumber)}`;
    if (reaction.isRemove) {
      await this.#client.delete(path, payload);
    } else {
      await this.#client.post(path, payload);
    }
  }

  /** Send a typing indicator. */
  async typing(recipient: string, stop = false): Promise<void> {
    const payload: Record<string, unknown> = {
      account: this.#client.phoneNumber,
      recipient,
      stop,
    };
    await this.#client.post("/v1/typing", payload);
  }

  /** Delete a previously sent message by timestamp. */
  async deleteMessage(recipient: string, timestamp: number): Promise<void> {
    const payload: Record<string, unknown> = {
      recipient,
      timestamp,
    };
    await this.#client.post(
      `/v1/${encodeURIComponent(this.#client.phoneNumber)}/delete-message`,
      payload,
    );
  }

  /** Edit a previously sent message. */
  async editMessage(
    recipient: string,
    targetTimestamp: number,
    newText: string,
    options: Omit<SendOptions, "editTimestamp"> = {},
  ): Promise<SendResult> {
    return this.send(recipient, newText, {
      ...options,
      editTimestamp: targetTimestamp,
    });
  }

  /** List groups the bot is a member of. */
  async getGroups(): Promise<Group[]> {
    return this.#client.get<Group[]>(
      `/v1/groups/${encodeURIComponent(this.#client.phoneNumber)}`,
    );
  }

  /** The underlying HTTP client (for advanced use). */
  get httpClient(): HttpClient {
    return this.#client;
  }
}
