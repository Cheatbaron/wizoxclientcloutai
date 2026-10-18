import {
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
  SlashCommandBuilder,
  REST,
  Routes,
} from 'discord.js';

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('Set DISCORD_TOKEN, CLIENT_ID and GUILD_ID environment variables.');
  process.exit(1);
}

const announce = new SlashCommandBuilder()
  .setName('announce')
  .setDescription('Ping @everyone with a message and a link')
  .addStringOption((o) => o.setName('link').setDescription('Link to share').setRequired(true))
  .addStringOption((o) => o.setName('message').setDescription('Text to send with the link'))
  // Only members who can already mention @everyone see and can use the command.
  .setDefaultMemberPermissions(PermissionFlagsBits.MentionEveryone);

await new REST().setToken(DISCORD_TOKEN).put(
  Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
  { body: [announce.toJSON()] },
);

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => console.log(`Logged in as ${client.user.tag}`));

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'announce') return;

  const link = interaction.options.getString('link');
  const message = interaction.options.getString('message') ?? '';

  try {
    new URL(link);
  } catch {
    return interaction.reply({ content: 'That is not a valid link.', ephemeral: true });
  }

  await interaction.channel.send({
    content: `@everyone ${message}\n${link}`.trim(),
    allowedMentions: { parse: ['everyone'] },
  });
  await interaction.reply({ content: 'Announcement sent.', ephemeral: true });
});

client.login(DISCORD_TOKEN);
