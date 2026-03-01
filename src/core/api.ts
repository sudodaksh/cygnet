import { HttpClient, type ClientConfig } from "./client.ts";
import type {
  CreateGroupOptions,
  Group,
  SendOptions,
  SendReactionPayload,
  SendResult,
  UpdateGroupOptions,
  UpdateProfileOptions,
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

    const raw = await this.#client.post<Record<string, unknown>>("/v2/send", payload);
    return {
      ...raw,
      timestamp: Number(raw.timestamp),
    } as SendResult;
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
    const path = `/v1/typing-indicator/${encodeURIComponent(this.#client.phoneNumber)}`;
    const payload: Record<string, unknown> = { recipient };
    if (stop) {
      await this.#client.delete(path, payload);
    } else {
      await this.#client.put(path, payload);
    }
  }

  /** Delete a previously sent message by timestamp. */
  async deleteMessage(recipient: string, timestamp: number): Promise<void> {
    const payload: Record<string, unknown> = {
      recipient,
      timestamp,
    };
    await this.#client.delete(
      `/v1/remote-delete/${encodeURIComponent(this.#client.phoneNumber)}`,
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

  // --- Group management ---

  #groupPath(groupId?: string): string {
    const base = `/v1/groups/${encodeURIComponent(this.#client.phoneNumber)}`;
    return groupId ? `${base}/${encodeURIComponent(groupId)}` : base;
  }

  /** List groups the bot is a member of. */
  async getGroups(): Promise<Group[]> {
    return this.#client.get<Group[]>(this.#groupPath());
  }

  /** Get details for a specific group. */
  async getGroup(groupId: string): Promise<Group> {
    return this.#client.get<Group>(this.#groupPath(groupId));
  }

  /** Create a new group. Returns the created group's details. */
  async createGroup(options: CreateGroupOptions): Promise<Group> {
    const payload: Record<string, unknown> = {
      name: options.name,
      members: options.members,
    };
    if (options.description !== undefined) payload.description = options.description;
    if (options.base64Avatar !== undefined) payload.base64_avatar = options.base64Avatar;
    if (options.expirationTime !== undefined) payload.expiration_time = options.expirationTime;
    if (options.groupLinkState !== undefined) payload.group_link = options.groupLinkState;
    if (options.permissions) payload.permissions = options.permissions;
    return this.#client.post<Group>(this.#groupPath(), payload);
  }

  /** Update group properties (name, description, avatar, permissions, etc.). */
  async updateGroup(
    groupId: string,
    options: UpdateGroupOptions,
  ): Promise<void> {
    const payload: Record<string, unknown> = {};
    if (options.name !== undefined) payload.name = options.name;
    if (options.description !== undefined) payload.description = options.description;
    if (options.base64Avatar !== undefined) payload.base64_avatar = options.base64Avatar;
    if (options.expirationTime !== undefined) payload.expiration_time = options.expirationTime;
    if (options.groupLinkState !== undefined) payload.group_link = options.groupLinkState;
    if (options.permissions) payload.permissions = options.permissions;
    await this.#client.put(this.#groupPath(groupId), payload);
  }

  /** Download a group's avatar. Returns raw bytes. */
  async getGroupAvatar(groupId: string): Promise<Uint8Array> {
    return this.#client.getBytes(`${this.#groupPath(groupId)}/avatar`);
  }

  /** Add members to a group. */
  async addMembers(groupId: string, members: string[]): Promise<void> {
    await this.#client.post(`${this.#groupPath(groupId)}/members`, { members });
  }

  /** Remove members from a group. */
  async removeMembers(groupId: string, members: string[]): Promise<void> {
    await this.#client.delete(`${this.#groupPath(groupId)}/members`, { members });
  }

  /** Promote members to group admin. */
  async addAdmins(groupId: string, admins: string[]): Promise<void> {
    await this.#client.post(`${this.#groupPath(groupId)}/admins`, { admins });
  }

  /** Demote group admins. */
  async removeAdmins(groupId: string, admins: string[]): Promise<void> {
    await this.#client.delete(`${this.#groupPath(groupId)}/admins`, { admins });
  }

  /** Block a group. */
  async blockGroup(groupId: string): Promise<void> {
    await this.#client.post(`${this.#groupPath(groupId)}/block`);
  }

  /** Join a group via invite link. */
  async joinGroup(groupId: string): Promise<void> {
    await this.#client.post(`${this.#groupPath(groupId)}/join`);
  }

  /** Leave a group. */
  async leaveGroup(groupId: string): Promise<void> {
    await this.#client.post(`${this.#groupPath(groupId)}/quit`);
  }

  // --- Profile ---

  /** Update the bot's profile (name, avatar, bio). */
  async updateProfile(options: UpdateProfileOptions): Promise<void> {
    const payload: Record<string, unknown> = { name: options.name };
    if (options.base64Avatar !== undefined) payload.base64_avatar = options.base64Avatar;
    if (options.about !== undefined) payload.about = options.about;
    await this.#client.put(
      `/v1/profiles/${encodeURIComponent(this.#client.phoneNumber)}`,
      payload,
    );
  }

  /** Download a received attachment by ID. Returns raw bytes. */
  async downloadAttachment(id: string): Promise<Uint8Array> {
    return this.#client.getBytes(
      `/v1/attachments/${encodeURIComponent(id)}`,
    );
  }

  /** List all stored attachment IDs. */
  async listAttachments(): Promise<string[]> {
    return this.#client.get<string[]>("/v1/attachments");
  }

  /** Delete a stored attachment by ID. */
  async deleteAttachment(id: string): Promise<void> {
    await this.#client.delete(
      `/v1/attachments/${encodeURIComponent(id)}`,
    );
  }

  /** The underlying HTTP client (for advanced use). */
  get httpClient(): HttpClient {
    return this.#client;
  }
}
