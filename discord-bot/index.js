import {
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';

const { DISCORD_TOKEN } = process.env;
if (!DISCORD_TOKEN) {
  console.error('Set the DISCORD_TOKEN environment variable.');
  process.exit(1);
}

const announce = new SlashCommandBuilder()
  .setName('announce')
  .setDescription('Ping @everyone with a message and a link')
  .addStringOption((o) => o.setName('link').setDescription('Link to share').setRequired(true))
  .addStringOption((o) => o.setName('message').setDescription('Text to send with the link'))
  // Only members who can already mention @everyone see and can use the command.
  .setDefaultMemberPermissions(PermissionFlagsBits.MentionEveryone);

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Guild commands show up instantly, unlike global ones.
const registerCommands = (guild) => guild.commands.set([announce.toJSON()]);

client.once('ready', async () => {
  await Promise.all(client.guilds.cache.map(registerCommands));
  console.log(`Logged in as ${client.user.tag} in ${client.guilds.cache.size} server(s)`);
});

client.on('guildCreate', registerCommands);

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
