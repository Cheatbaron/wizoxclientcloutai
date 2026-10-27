import "dotenv/config";
import {
  AttachmentBuilder,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { welcomeCard } from "./card.js";

const { DISCORD_TOKEN, WELCOME_CHANNEL_ID } = process.env;
if (!DISCORD_TOKEN || !WELCOME_CHANNEL_ID) {
  console.error("Set DISCORD_TOKEN and WELCOME_CHANNEL_ID in your .env file (see .env.example).");
  process.exit(1);
}

const RED = 0xff2e43;

const client = new Client({
  // GuildMembers is needed to see people join. Turn on "Server Members Intent"
  // in the Developer Portal → Bot page, or the bot won't receive joins.
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

async function buildWelcome(member) {
  const avatarUrl = member.user.displayAvatarURL({ extension: "png", size: 512, forceStatic: true });
  const avatar = Buffer.from(await (await fetch(avatarUrl)).arrayBuffer());
  const file = new AttachmentBuilder(await welcomeCard(avatar), { name: "welcome.png" });

  const embed = new EmbedBuilder()
    .setColor(RED)
    .setImage("attachment://welcome.png")
    .setDescription(`**Welcome** ${member}`)
    .setFooter({ text: `Member #${member.guild.memberCount}` });

  // The mention in `content` is what actually pings them; mentions inside embeds don't.
  return { content: `${member}`, embeds: [embed], files: [file], allowedMentions: { users: [member.id] } };
}

async function sendWelcome(member) {
  const channel = await member.guild.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased()) {
    console.error(`Welcome channel ${WELCOME_CHANNEL_ID} not found in ${member.guild.name}.`);
    return;
  }
  await channel.send(await buildWelcome(member));
}

const testCommand = new SlashCommandBuilder()
  .setName("testwelcome")
  .setDescription("Show the welcome message for you, as if you just joined.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

client.once(Events.ClientReady, async (c) => {
  console.log(`Wizoxhub is online as ${c.user.tag}`);
  // Guild commands show up instantly, unlike global ones.
  for (const guild of c.guilds.cache.values()) {
    await guild.commands.create(testCommand).catch((e) => console.error(`Couldn't add /testwelcome in ${guild.name}:`, e.message));
  }
});

client.on(Events.GuildMemberAdd, (member) => {
  sendWelcome(member).catch((e) => console.error("Welcome failed:", e));
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "testwelcome") return;
  await interaction.deferReply({ ephemeral: true });
  try {
    await sendWelcome(interaction.member);
    await interaction.editReply(`Sent a test welcome to <#${WELCOME_CHANNEL_ID}>.`);
  } catch (e) {
    await interaction.editReply(`Couldn't send it: ${e.message}`);
  }
});

client.login(DISCORD_TOKEN);
