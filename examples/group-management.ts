import { Bot } from "../index.ts";

const bot = new Bot({
  signalService: process.env.SIGNAL_SERVICE ?? "localhost:8080",
  phoneNumber: process.env.PHONE_NUMBER ?? "+491234567890",
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
