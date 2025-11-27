import { Client, GatewayIntentBits, Partials } from "discord.js";
import dotenv from "dotenv";
dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction],
});

// === CONFIG ===
const SUPERVISORS = [
  {
    id: "715472164832149524",
    channels: ["1442899113631813734"],
  },
  
];

const MANAGER_ID = "960685716852072458";

// === TIMER SETTINGS ===
const ONE_MINUTE = 1 * 60 * 1000;
const THIRTY_SECONDS = 30 * 1000;
const TEN_SECONDS = 10 * 1000;

// === TRACKERS ===
const supervisorTrackers = new Map();

// === HELPERS ===
function getSupervisorByChannel(channelId) {
  return SUPERVISORS.find((sup) => sup.channels.includes(channelId));
}

function ensureSupervisorMap(supervisorId) {
  if (!supervisorTrackers.has(supervisorId)) {
    supervisorTrackers.set(supervisorId, new Map());
  }
  return supervisorTrackers.get(supervisorId);
}

// === REMOVED WORKING HOURS CHECK ===
// function isWithinWorkingHours() { ... }  (DELETED)

// === EVENT: USER MESSAGE → START TIMER ===
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const supervisor = getSupervisorByChannel(message.channel.id);
  if (!supervisor) return;

  // Ignore messages from supervisors themselves so they don’t trigger timers
  if (message.author.id === supervisor.id || message.author.id === MANAGER_ID) return;

  const supervisorId = supervisor.id;
  const supervisorMessages = ensureSupervisorMap(supervisorId);

  const msgId = message.id;
  const userId = message.author.id;
  const msgLink = `https://discord.com/channels/${message.guildId}/${message.channel.id}/${message.id}`;

  console.log(`📩 Tracking message ${msgId} for supervisor ${supervisorId}`);

  const timers = {};

  timers.supervisorTimer = setTimeout(async () => {
    try {
      const supUser = await client.users.fetch(supervisorId);
      await supUser.send(
        `⏰ Hey <@${supervisorId}>, you haven’t replied to <@${userId}>'s message yet!\nLink: ${msgLink}`
      );

      timers.reminderTimer = setTimeout(async () => {
        try {
          await supUser.send(
            `⚠️ Reminder: You still haven’t replied to <@${userId}>'s message.\nLink: ${msgLink}`
          );

          timers.managerTimer = setTimeout(async () => {
            try {
              const manager = await client.users.fetch(MANAGER_ID);
              await manager.send(
                `🚨 Supervisor <@${supervisorId}> has not replied to <@${userId}>'s message.\nLink: ${msgLink}`
              );
            } catch (err) {
              console.error("❌ Error sending manager DM:", err);
            }
          }, TEN_SECONDS);
        } catch (err) {
          console.error("❌ Error sending reminder:", err);
        }
      }, THIRTY_SECONDS);
    } catch (err) {
      console.error("❌ Error sending supervisor DM:", err);
    }
  }, ONE_MINUTE);

  supervisorMessages.set(msgId, {
    userId,
    channelId: message.channel.id,
    messageLink: msgLink,
    timers,
  });
});

// === EVENT: SUPERVISOR OR MANAGER REPLY ===
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const supervisor = getSupervisorByChannel(message.channel.id);
  if (!supervisor) return;

  const isSupervisor = message.author.id === supervisor.id;
  const isManager = message.author.id === MANAGER_ID;

  if (!isSupervisor && !isManager) return;

  const supervisorMessages = supervisorTrackers.get(supervisor.id);
  if (!supervisorMessages) return;

  for (const [msgId, tracked] of supervisorMessages.entries()) {
    if (tracked.channelId === message.channel.id) {
      clearTimeout(tracked.timers.supervisorTimer);
      clearTimeout(tracked.timers.reminderTimer);
      clearTimeout(tracked.timers.managerTimer);
      supervisorMessages.delete(msgId);

      console.log(
        `✅ ${isManager ? "Manager" : "Supervisor"} ${message.author.id} replied → cleared timers for ${msgId}`
      );
    }
  }

  if (supervisorMessages.size === 0) {
    supervisorTrackers.delete(supervisor.id);
  }
});

// === EVENT: SUPERVISOR OR MANAGER REACTION ===
client.on("messageReactionAdd", async (reaction, user) => {
  if (user.bot) return;

  const message = reaction.message;
  const supervisor = getSupervisorByChannel(message.channel.id);
  if (!supervisor) return;

  const isSupervisor = user.id === supervisor.id;
  const isManager = user.id === MANAGER_ID;

  if (!isSupervisor && !isManager) return;

  const supervisorMessages = supervisorTrackers.get(supervisor.id);
  if (!supervisorMessages) return;

  for (const [msgId, tracked] of supervisorMessages.entries()) {
    if (tracked.channelId === message.channel.id) {
      clearTimeout(tracked.timers.supervisorTimer);
      clearTimeout(tracked.timers.reminderTimer);
      clearTimeout(tracked.timers.managerTimer);
      supervisorMessages.delete(msgId);

      console.log(`🟢 ${isManager ? "Manager" : "Supervisor"} ${user.id} reacted → cleared timers for ${msgId}`);
    }
  }

  if (supervisorMessages.size === 0) {
    supervisorTrackers.delete(supervisor.id);
  }
});

// === SHUTDOWN CLEANUP ===
process.on("SIGINT", () => {
  console.log("🛑 Shutting down...");
  for (const [, msgs] of supervisorTrackers) {
    for (const [, tracked] of msgs) {
      clearTimeout(tracked.timers.supervisorTimer);
      clearTimeout(tracked.timers.reminderTimer);
      clearTimeout(tracked.timers.managerTimer);
    }
  }
  process.exit();
});

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);
