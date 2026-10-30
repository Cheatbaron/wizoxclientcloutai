import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import {
  ActionRowBuilder,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

const { VOUCH_CHANNEL_ID, VOUCH_SITE } = process.env;
const RED = 0xff2e43;

const DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../data");
const DATA_FILE = resolve(DATA_DIR, "vouches.json");

// [{ from, title, text, rating, at, channelId, messageId }]
function load() {
  if (!existsSync(DATA_FILE)) return [];
  try {
    const data = JSON.parse(readFileSync(DATA_FILE, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function save(list) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(DATA_FILE, JSON.stringify(list, null, 2));
}

function siteUrl() {
  if (!VOUCH_SITE) return null;
  return VOUCH_SITE.startsWith("http") ? VOUCH_SITE : `https://${VOUCH_SITE}`;
}

function vouchEmbed({ title, text, rating }, user, postedBy) {
  const lines = [text];
  if (rating) lines.push("", `**Rating:** ${rating}/10`);
  lines.push(postedBy ? `-# by ${user} · posted by ${postedBy}` : `-# by ${user}`);

  const embed = new EmbedBuilder().setColor(RED).setTitle(title).setDescription(lines.join("\n"));
  const url = siteUrl();
  if (url) {
    // A title with a link shows up blue, like in the screenshot.
    embed.setURL(url).setFooter({ text: `Review at ${VOUCH_SITE.replace(/^https?:\/\//, "")}` });
  }
  return embed;
}

function parseRating(raw) {
  if (!raw?.trim()) return null;
  const n = Number(raw.trim().replace(",", ".").replace(/\/10$/, ""));
  if (!Number.isFinite(n) || n < 0 || n > 10) return undefined;
  return Math.round(n * 10) / 10;
}

export const vouchCommands = [
  new SlashCommandBuilder()
    .setName("vouch")
    .setDescription("Leave a review / vouch.")
    .addUserOption((o) => o.setName("for").setDescription("(Staff) Post a vouch on behalf of a buyer.").setRequired(false)),
  new SlashCommandBuilder().setName("vouchstats").setDescription("See how many vouches there are and the average rating."),
  new SlashCommandBuilder()
    .setName("removevouch")
    .setDescription("(Admin) Delete every vouch from a user.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption((o) => o.setName("user").setDescription("Whose vouches to delete.").setRequired(true)),
];

function vouchModal(forId) {
  const input = (id, label, style, opts = {}) =>
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(opts.required ?? true)
        .setMaxLength(opts.max ?? 4000).setPlaceholder(opts.placeholder ?? ""),
    );
  return new ModalBuilder()
    .setCustomId(forId ? `vouch:modal:${forId}` : "vouch:modal")
    .setTitle("Leave a vouch")
    .addComponents(
      input("title", "Title", TextInputStyle.Short, { max: 100, placeholder: "Pretty good" }),
      input("text", "Your review", TextInputStyle.Paragraph, { max: 1500, placeholder: "What did you like? What could be better?" }),
      input("rating", "Rating out of 10 (optional)", TextInputStyle.Short, { required: false, max: 4, placeholder: "7.5" }),
    );
}

export async function handleVouchInteraction(interaction) {
  if (interaction.isModalSubmit() && interaction.customId.startsWith("vouch:modal")) {
    await submitVouch(interaction);
    return true;
  }
  if (!interaction.isChatInputCommand()) return false;

  switch (interaction.commandName) {
    case "vouch":
      if (!VOUCH_CHANNEL_ID) {
        await interaction.reply({ content: "Vouches aren't set up yet: add VOUCH_CHANNEL_ID to the bot's .env.", flags: MessageFlags.Ephemeral });
      } else {
        const buyer = interaction.options.getUser("for");
        if (buyer && !isStaff(interaction)) {
          await interaction.reply({ content: "Only staff can post vouches for other people.", flags: MessageFlags.Ephemeral });
        } else if (buyer?.bot) {
          await interaction.reply({ content: "You can't post a vouch for a bot.", flags: MessageFlags.Ephemeral });
        } else {
          await interaction.showModal(vouchModal(buyer?.id));
        }
      }
      return true;
    case "vouchstats":
      await vouchStats(interaction);
      return true;
    case "removevouch":
      await removeVouches(interaction);
      return true;
    default:
      return false;
  }
}

function isStaff(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}

async function submitVouch(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const forId = interaction.customId.split(":")[2];
  if (forId && !isStaff(interaction)) {
    await interaction.editReply("Only staff can post vouches for other people.");
    return;
  }
  const author = forId ? await interaction.client.users.fetch(forId) : interaction.user;
  const postedBy = forId ? interaction.user : null;

  const title = interaction.fields.getTextInputValue("title").trim();
  const text = interaction.fields.getTextInputValue("text").trim();
  const rating = parseRating(interaction.fields.getTextInputValue("rating"));
  if (rating === undefined) {
    await interaction.editReply("The rating has to be a number from 0 to 10, like `8` or `7.5`.");
    return;
  }

  const channel = await interaction.guild.channels.fetch(VOUCH_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased()) {
    await interaction.editReply("I couldn't find the vouch channel. Ask an admin to check VOUCH_CHANNEL_ID.");
    return;
  }

  const vouch = { title, text, rating };
  const msg = await channel.send({ embeds: [vouchEmbed(vouch, author, postedBy)], allowedMentions: { parse: [] } });

  const list = load();
  list.push({ from: author.id, ...(postedBy && { postedBy: postedBy.id }), ...vouch, at: Date.now(), channelId: channel.id, messageId: msg.id });
  save(list);

  await interaction.editReply(forId ? `Posted ${author.username}'s vouch in ${channel}.` : `Thanks! Your vouch was posted in ${channel}.`);
}

async function vouchStats(interaction) {
  const list = load();
  const rated = list.filter((v) => typeof v.rating === "number");
  const avg = rated.length ? (rated.reduce((s, v) => s + v.rating, 0) / rated.length).toFixed(1) : null;

  const embed = new EmbedBuilder()
    .setColor(RED)
    .setTitle("Vouches")
    .setDescription(
      list.length
        ? `**${list.length}** vouch${list.length === 1 ? "" : "es"} total` + (avg ? `\nAverage rating: **${avg}/10**` : "")
        : "No vouches yet. Be the first with `/vouch`!",
    );
  await interaction.reply({ embeds: [embed] });
}

async function removeVouches(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const user = interaction.options.getUser("user");
  const list = load();
  const theirs = list.filter((v) => v.from === user.id);

  for (const v of theirs) {
    const channel = await interaction.guild.channels.fetch(v.channelId).catch(() => null);
    await channel?.messages.delete(v.messageId).catch(() => {});
  }
  save(list.filter((v) => v.from !== user.id));
  await interaction.editReply(`Deleted ${theirs.length} vouch${theirs.length === 1 ? "" : "es"} from ${user.username}.`);
}
