import { Bot } from "../index.ts";

const bot = new Bot({
  signalService: process.env.SIGNAL_SERVICE ?? "localhost:8080",
  phoneNumber: process.env.PHONE_NUMBER ?? "+491234567890",
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// /setprofile Bot Name | bio — update the bot's profile
bot.command("setprofile", async (ctx) => {
  const args = ctx.match?.toString().trim() ?? "";
  const [name, ...rest] = args.split("|").map((s) => s.trim());
  const about = rest.join("|").trim() || undefined;
  await bot.api.updateProfile({ name: name || "Cygnet Bot", about });
  await ctx.reply(`Profile updated! Name: "${name || "Cygnet Bot"}"${about ? `, Bio: "${about}"` : ""}`);
});

// /rename New Name — rename the current group
bot.command("rename", async (ctx) => {
  if (!ctx.isGroup) return ctx.reply("Use this in a group.");
  const name = ctx.match?.toString().trim();
  if (!name) return ctx.reply("Usage: /rename New Name");
  await bot.api.updateGroup(ctx.chat, { name });
  await ctx.reply(`Group renamed to "${name}".`);
});

// /desc New description — update group description
bot.command("desc", async (ctx) => {
  if (!ctx.isGroup) return ctx.reply("Use this in a group.");
  const description = ctx.match?.toString().trim();
  if (!description) return ctx.reply("Usage: /desc Some description");
  await bot.api.updateGroup(ctx.chat, { description });
  await ctx.reply("Group description updated.");
});

// /lockdown — restrict editing and adding members to admins only
bot.command("lockdown", async (ctx) => {
  if (!ctx.isGroup) return ctx.reply("Use this in a group.");
  await bot.api.updateGroup(ctx.chat, {
    permissions: {
      editGroupPermission: "only-admins",
      addMembersPermission: "only-admins",
    },
  });
  await ctx.reply("Group locked down — only admins can edit or add members.");
});

// /unlock — allow all members to edit and add members
bot.command("unlock", async (ctx) => {
  if (!ctx.isGroup) return ctx.reply("Use this in a group.");
  await bot.api.updateGroup(ctx.chat, {
    permissions: {
      editGroupPermission: "every-member",
      addMembersPermission: "every-member",
    },
  });
  await ctx.reply("Group unlocked — all members can edit and add members.");
});

// /makegroup Group Name — create a group and add you to it
bot.command("makegroup", async (ctx) => {
  const name = ctx.match?.toString().trim() || "Cygnet Group";
  const group = await bot.api.createGroup({
    name,
    members: [ctx.sender],
  });
  await bot.api.send(group.id, `Group "${name}" created!`);
});

// /kickme — create a group, add you, then kick you
bot.command("kickme", async (ctx) => {
  const user = ctx.sender;
  const group = await bot.api.createGroup({
    name: "You're getting kicked",
    members: [user],
  });
  await bot.api.send(group.id, "Welcome! ...just kidding.");
  await sleep(2000);
  await bot.api.send(group.id, "Bye!");
  await bot.api.removeMembers(group.id, [user]);
});

// DM the bot anything to trigger the full group lifecycle demo
bot.on("message:private", async (ctx) => {
  const user = ctx.sender;
  await ctx.reply(`Starting group lifecycle demo with ${user}...`);

  // 1. Create group
  await ctx.reply("1. Creating group...");
  const group = await bot.api.createGroup({
    name: "Cygnet Demo Group",
    members: [user],
  });
  const groupId = group.id;
  await bot.api.send(groupId, "Welcome to the demo group!");
  await sleep(1500);

  // 2. Rename group
  await bot.api.send(groupId, '2. Renaming group to "Cygnet Renamed"...');
  await bot.api.updateGroup(groupId, { name: "Cygnet Renamed" });
  await sleep(1500);

  // 3. Promote user to admin
  await bot.api.send(groupId, `3. Promoting ${user} to admin...`);
  await bot.api.addAdmins(groupId, [user]);
  await sleep(1500);

  // 4. Demote user from admin
  await bot.api.send(groupId, `4. Demoting ${user} from admin...`);
  await bot.api.removeAdmins(groupId, [user]);
  await sleep(1500);

  // 5. Remove user from group
  await bot.api.send(groupId, `5. Removing ${user} from group...`);
  await bot.api.removeMembers(groupId, [user]);
  await sleep(1500);

  // 6. Add user back
  await ctx.reply("6. Adding you back to the group...");
  await bot.api.addMembers(groupId, [user]);
  await bot.api.send(groupId, "You're back!");
  await sleep(1500);

  // 7. Leave group (promote user first — last admin can't leave)
  await bot.api.send(groupId, "7. Promoting you to admin so bot can leave...");
  await bot.api.addAdmins(groupId, [user]);
  await sleep(500);
  await bot.api.send(groupId, "Goodbye!");
  await bot.api.leaveGroup(groupId);

  await ctx.reply("Done! Full lifecycle complete.");
});

bot.catch((err) => {
  console.error("[group-management]", err.error);
});

bot.start().catch(console.error);
