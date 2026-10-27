import "dotenv/config";
import {
  AttachmentBuilder,
  Client,
  ContainerBuilder,
  Events,
  GatewayIntentBits,
  MediaGalleryBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextDisplayBuilder,
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

  // Discord's newer message layout: a red-edged box with the big card on top and the text under it.
  const box = new ContainerBuilder()
    .setAccentColor(RED)
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems((item) => item.setURL("attachment://welcome.png")))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**Welcome** ${member}`),
      new TextDisplayBuilder().setContent(`-# Member #${member.guild.memberCount}`),
    );

  return {
    components: [box],
    files: [file],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { users: [member.id] },
  };
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
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    await sendWelcome(interaction.member);
    await interaction.editReply(`Sent a test welcome to <#${WELCOME_CHANNEL_ID}>.`);
  } catch (e) {
    await interaction.editReply(`Couldn't send it: ${e.message}`);
  }
});

client.login(DISCORD_TOKEN);
