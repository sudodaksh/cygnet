import { Bot } from "../index.ts";

const bot = new Bot({
  signalService: process.env.SIGNAL_SERVICE ?? "localhost:8080",
  phoneNumber: process.env.PHONE_NUMBER ?? "+491234567890",
});

// /contacts — list all saved contacts
bot.command("contacts", async (ctx) => {
  const contacts = await bot.api.listContacts();
  if (contacts.length === 0) {
    return ctx.reply("No contacts found.");
  }
  const lines = contacts.map((c) => {
    const name = c.name || c.profileName || c.username || "(unnamed)";
    return `• ${name} — ${c.number ?? c.uuid}`;
  });
  await ctx.reply(`Contacts (${contacts.length}):\n${lines.join("\n")}`);
});

// /everyone — list all known recipients (includes non-contacts)
bot.command("everyone", async (ctx) => {
  const all = await bot.api.listContacts(true);
  if (all.length === 0) {
    return ctx.reply("No known recipients.");
  }
  const lines = all.map((c) => {
    const name = c.name || c.profileName || c.username || "(unnamed)";
    const blocked = c.blocked ? " [blocked]" : "";
    return `• ${name}${blocked} — ${c.number ?? c.uuid}`;
  });
  await ctx.reply(`All recipients (${all.length}):\n${lines.join("\n")}`);
});

// /lookup <uuid> — get details for a specific contact
bot.command("lookup", async (ctx) => {
  const uuid = typeof ctx.match === "string" ? ctx.match.trim() : "";
  if (!uuid) {
    return ctx.reply("Usage: /lookup <uuid>");
  }
  try {
    const contact = await bot.api.getContact(uuid);
    const lines = [
      `Name: ${contact.name || "(not set)"}`,
      `Profile: ${contact.profileName || "(not set)"}`,
      `Number: ${contact.number || "(hidden)"}`,
      `UUID: ${contact.uuid}`,
      `Username: ${contact.username || "(not set)"}`,
      `Blocked: ${contact.blocked}`,
      `Disappearing: ${contact.messageExpiration || "off"}`,
    ];
    if (contact.profile.about) {
      lines.push(`About: ${contact.profile.about}`);
    }
    if (contact.note) {
      lines.push(`Note: ${contact.note}`);
    }
    await ctx.reply(lines.join("\n"));
  } catch (err) {
    await ctx.reply(`Contact not found: ${uuid}`);
  }
});

// /whois — look up the sender's contact info
bot.command("whois", async (ctx) => {
  const uuid = ctx.fromUuid;
  if (!uuid) {
    return ctx.reply("Can't determine your UUID.");
  }
  try {
    const contact = await bot.api.getContact(uuid);
    const lines = [
      `Name: ${contact.name || "(not set)"}`,
      `Profile: ${contact.profileName || "(not set)"}`,
      `Number: ${contact.number || "(hidden)"}`,
      `UUID: ${contact.uuid}`,
      `Username: ${contact.username || "(not set)"}`,
    ];
    if (contact.profile.about) {
      lines.push(`About: ${contact.profile.about}`);
    }
    await ctx.reply(lines.join("\n"));
  } catch {
    await ctx.reply("You're not in my contacts yet.");
  }
});

// /nickname <name> — set a contact name for the sender
bot.command("nickname", async (ctx) => {
  const name = typeof ctx.match === "string" ? ctx.match.trim() : "";
  if (!name) {
    return ctx.reply("Usage: /nickname <name>");
  }
  await bot.api.updateContact({ recipient: ctx.sender, name });
  await ctx.reply(`Saved your contact name as "${name}".`);
});

bot.command("help", (ctx) =>
  ctx.reply([
    "Contact commands:",
    "/contacts — List all saved contacts",
    "/everyone — List all known recipients",
    "/lookup <uuid> — Look up a specific contact",
    "/whois — Show your own contact info",
    "/nickname <name> — Set a contact name for yourself",
  ].join("\n"))
);

bot.catch((err) => {
  console.error("[contacts]", err.error);
});

bot.start().catch(console.error);
