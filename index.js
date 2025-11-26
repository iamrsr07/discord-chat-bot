import { Client, GatewayIntentBits, Partials } from "discord.js";
import dotenv from "dotenv";
dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,   // 👈 REQUIRED FOR EMOJI DETECTION
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction],
});

// === CONFIG ===
const SUPERVISORS = [
  {
    id: "1176921674847899658",
    channels: [
      "1337431949479907399",
      "1331965624972218471",
      "1390384030289100923",
      "1395279077492920340",
      "1398040825233145907",
      "1350138558299770930",
      "1400903907030466711",
      "1417583958710812803",
      "1427823151735115856",
      "1384217042592337950",
      "1298788649378254898",
    ],
  },
  {
    id: "927152043901194252",
    channels: [
      "1280198714144854067",
      "1285653192662843513",
      "1289692995339423894",
      "1371582264785506414",
      "1303086358663004272",
      "1392358861314195467",
      "1405357043270811739",
      "1429940950381363472",
      "1430276051409571861",
    ],
  },
  {
    id: "1044490910299344947",
    channels: [
      "1268654542229078138",
      "1293003358835310674",
      "1347241920837189722",
      "1400565862041260173",
    ],
  },
    {
    id: "1018088392883437578",
    channels: [
      "1399837691465437307",
      "1401931473501687888",
      "1397650955209670737",
      "1410363931943370866",
      "1415437343309037708",
      "1418273553282760835",
      "1423084812234920036",
    ],
  },
  {
    id: "1103342081101021256",
    channels: [
      "1425525436926005298",
      "1407133150810996868",
      "1430343133841063966",
    ],
  }, 
  {
    id: "1193254730605015134",
    channels: [
      "1431179512087052308",
      "1430342550799253555",
      "1387528654258569418",
      "1272947141815308360",
      "1404157497220006039",
     
    ],
  },
    {
    id: "1415207780435890197",
    channels: [
      "1430276823669014629",
      "1323095953414033538",
      "1392569533679665152",
     
     
    ],
  },
  
];

const MANAGER_ID = "960685716852072458";

// === TIMER SETTINGS ===
const TWO_HOURS = 2 * 60 * 60 * 1000;
const ONE_AND_HALF_HOUR = 1.5 * 60 * 60 * 1000;
const THIRTY_MINUTES = 30 * 60 * 1000;

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

// Working hours (9 AM – 5 PM EST)
function isWithinWorkingHours() {
  const now = new Date();
  const estNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const hours = estNow.getHours();
  return hours >= 9 && hours < 17;
}

// === EVENT: TRACK CLIENT MESSAGE ===
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const supervisor = getSupervisorByChannel(message.channel.id);
  if (!supervisor) return;

  const supervisorId = supervisor.id;
  const supervisorMessages = ensureSupervisorMap(supervisorId);

  const msgId = message.id;
  const userId = message.author.id;
  const msgLink = `https://discord.com/channels/${message.guildId}/${message.channel.id}/${message.id}`;

  console.log(`📩 Tracking message ${msgId} for supervisor ${supervisorId}`);

  const timers = {};

  // Step 1 DM after 2 hours
  timers.supervisorTimer = setTimeout(async () => {
    if (!isWithinWorkingHours()) return;

    try {
      const supUser = await client.users.fetch(supervisorId);
      await supUser.send(
        `⏰ Hey <@${supervisorId}>, you haven’t replied to <@${userId}>'s message yet!\nLink: ${msgLink}`
      );

      // Step 2 reminder after 1.5 hours
      timers.reminderTimer = setTimeout(async () => {
        if (!isWithinWorkingHours()) return;

        try {
          await supUser.send(
            `⚠️ Reminder: You still haven’t replied to <@${userId}>'s message.\nLink: ${msgLink}`
          );

          // Step 3 escalate after 30 min
          timers.managerTimer = setTimeout(async () => {
            if (!isWithinWorkingHours()) return;

            try {
              const manager = await client.users.fetch(MANAGER_ID);
              await manager.send(
                `🚨 Clients <@${supervisorId}> has not replied to <@${userId}>'s message.\nLink: ${msgLink}`
              );
            } catch (err) {
              console.error("❌ Error sending manager DM:", err);
            }
          }, THIRTY_MINUTES);

        } catch (err) {
          console.error("❌ Error sending reminder:", err);
        }
      }, ONE_AND_HALF_HOUR);

    } catch (err) {
      console.error("❌ Error sending supervisor DM:", err);
    }
  }, TWO_HOURS);

  supervisorMessages.set(msgId, {
    userId,
    channelId: message.channel.id,
    messageLink: msgLink,
    timers,
  });
});

// === EVENT: SUPERVISOR OR MANAGER MESSAGE REPLY ===
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const isSupervisor = SUPERVISORS.some((sup) => sup.id === message.author.id);
  const isManager = message.author.id === MANAGER_ID;

  if (!isSupervisor && !isManager) return;

  const supervisor = getSupervisorByChannel(message.channel.id);
  if (!supervisor) return;

  const supervisorId = supervisor.id;
  const supervisorMessages = supervisorTrackers.get(supervisorId);
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
    supervisorTrackers.delete(supervisorId);
  }
});

// === NEW: EVENT — SUPERVISOR EMOJI REACTION ===
client.on("messageReactionAdd", async (reaction, user) => {
  if (user.bot) return;

  const isSupervisor = SUPERVISORS.some((sup) => sup.id === user.id);
  if (!isSupervisor) return;

  const msg = reaction.message;

  const supervisor = getSupervisorByChannel(msg.channel.id);
  if (!supervisor) return;

  const supervisorId = supervisor.id;
  const supervisorMessages = supervisorTrackers.get(supervisorId);
  if (!supervisorMessages) return;

  const tracked = supervisorMessages.get(msg.id);
  if (!tracked) return;

  // Stop timers on emoji
  clearTimeout(tracked.timers.supervisorTimer);
  clearTimeout(tracked.timers.reminderTimer);
  clearTimeout(tracked.timers.managerTimer);

  supervisorMessages.delete(msg.id);

  console.log(`🎉 Supervisor ${user.id} reacted with emoji → cleared timers for ${msg.id}`);
});

// Shutdown
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
