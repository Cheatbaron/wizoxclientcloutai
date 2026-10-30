import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  EmbedBuilder,
  SlashCommandBuilder,
  PermissionFlagsBits,
} from "discord.js";

const DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../data");
const DATA_FILE = resolve(DATA_DIR, "vouches.json");

// { [targetId]: [{ from, reason, at }] }
function load() {
  if (!existsSync(DATA_FILE)) return {};
  try { return JSON.parse(readFileSync(DATA_FILE, "utf8")); }
  catch { return {}; }
}

function save(data) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function getVouches(data, targetId) {
  return data[targetId] ?? [];
}

function countVouches(data, targetId) {
  return getVouches(data, targetId).length;
}

// ─── Slash commands ───────────────────────────────────────────

export const vouchCommands = [
  new SlashCommandBuilder()
    .setName("vouch")
    .setDescription("Vouch for a member of the server.")
    .addUserOption((o) => o.setName("user").setDescription("Who are you vouching for?").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Why are you vouching for them?").setRequired(false).setMaxLength(200)),

  new SlashCommandBuilder()
    .setName("vouches")
    .setDescription("Check how many vouches a user has.")
    .addUserOption((o) => o.setName("user").setDescription("Whose vouches to check (defaults to you).").setRequired(false)),

  new SlashCommandBuilder()
    .setName("vouchleaderboard")
    .setDescription("Show the top vouched members in the server."),

  new SlashCommandBuilder()
    .setName("removevouch")
    .setDescription("(Admin) Remove a specific vouch from a user.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption((o) => o.setName("user").setDescription("User to remove a vouch from.").setRequired(true))
    .addUserOption((o) => o.setName("voucher").setDescription("Who gave the vouch to remove.").setRequired(true)),

  new SlashCommandBuilder()
    .setName("clearvouches")
    .setDescription("(Admin) Clear all vouches for a user.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption((o) => o.setName("user").setDescription("User to clear vouches for.").setRequired(true)),
];

// ─── Interaction handler ─────────────────────────────────────

export async function handleVouchInteraction(interaction) {
  if (!interaction.isChatInputCommand()) return false;
  const { commandName } = interaction;
  if (!["vouch", "vouches", "vouchleaderboard", "removevouch", "clearvouches"].includes(commandName)) return false;

  await interaction.deferReply();

  const data = load();

  // ── /vouch ──────────────────────────────────────────────────
  if (commandName === "vouch") {
    const target = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason") ?? "Ingen grunn oppgitt";
    const from = interaction.user;

    if (target.id === from.id) {
      await interaction.editReply({ embeds: [errEmbed("Du kan ikke vouche deg selv!")] });
      return true;
    }
    if (target.bot) {
      await interaction.editReply({ embeds: [errEmbed("Du kan ikke vouche bots.")] });
      return true;
    }

    if (!data[target.id]) data[target.id] = [];
    const existing = data[target.id].findIndex((v) => v.from === from.id);

    if (existing !== -1) {
      // update existing vouch
      data[target.id][existing] = { from: from.id, reason, at: Date.now() };
      save(data);
      const total = countVouches(data, target.id);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xf4b400)
            .setTitle("✏️ Vouch oppdatert")
            .setDescription(`Du oppdaterte vouchen din for ${target}.\n\n**Ny grunn:** ${reason}`)
            .setFooter({ text: `${target.username} har nå ${total} vouch${total === 1 ? "" : "s"} totalt.` })
            .setTimestamp(),
        ],
      });
    } else {
      data[target.id].push({ from: from.id, reason, at: Date.now() });
      save(data);
      const total = countVouches(data, target.id);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x2a9d8f)
            .setTitle("✅ Vouch registrert!")
            .setThumbnail(target.displayAvatarURL({ size: 128 }))
            .setDescription(`${from} voucher for ${target}!\n\n**Grunn:** ${reason}`)
            .setFooter({ text: `${target.username} har nå ${total} vouch${total === 1 ? "" : "s"} totalt.` })
            .setTimestamp(),
        ],
      });
    }
    return true;
  }

  // ── /vouches ─────────────────────────────────────────────────
  if (commandName === "vouches") {
    const target = interaction.options.getUser("user") ?? interaction.user;
    const list = getVouches(data, target.id);
    const total = list.length;

    if (total === 0) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x8a84a8)
            .setTitle(`${target.username} – Vouches`)
            .setThumbnail(target.displayAvatarURL({ size: 128 }))
            .setDescription("Ingen vouches ennå."),
        ],
      });
      return true;
    }

    // newest first, show last 10
    const recent = [...list].sort((a, b) => b.at - a.at).slice(0, 10);
    const lines = recent.map((v) => `• <@${v.from}> – *${v.reason}*`).join("\n");

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x3a6ea5)
          .setTitle(`${target.username} – ${total} vouch${total === 1 ? "" : "s"}`)
          .setThumbnail(target.displayAvatarURL({ size: 128 }))
          .setDescription(lines + (total > 10 ? `\n-# … og ${total - 10} til.` : ""))
          .setTimestamp(),
      ],
    });
    return true;
  }

  // ── /vouchleaderboard ────────────────────────────────────────
  if (commandName === "vouchleaderboard") {
    const entries = Object.entries(data)
      .map(([id, list]) => ({ id, count: list.length }))
      .filter((e) => e.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    if (entries.length === 0) {
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x8a84a8).setDescription("Ingen vouches ennå på serveren.")] });
      return true;
    }

    const medals = ["🥇", "🥈", "🥉"];
    const lines = entries.map((e, i) => `${medals[i] ?? `**${i + 1}.**`} <@${e.id}> — **${e.count}** vouch${e.count === 1 ? "" : "s"}`).join("\n");

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xf4b400)
          .setTitle("🏆 Vouch-leaderboard")
          .setDescription(lines)
          .setTimestamp(),
      ],
    });
    return true;
  }

  // ── /removevouch (admin) ─────────────────────────────────────
  if (commandName === "removevouch") {
    const target = interaction.options.getUser("user");
    const voucher = interaction.options.getUser("voucher");

    if (!data[target.id]) {
      await interaction.editReply({ embeds: [errEmbed(`${target.username} har ingen vouches.`)] });
      return true;
    }
    const before = data[target.id].length;
    data[target.id] = data[target.id].filter((v) => v.from !== voucher.id);
    const removed = before - data[target.id].length;
    if (removed === 0) {
      await interaction.editReply({ embeds: [errEmbed(`${voucher.username} har ikke voucha ${target.username}.`)] });
      return true;
    }
    save(data);
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xe63946)
          .setDescription(`Fjernet ${voucher.username}s vouch for ${target.username}. De har nå **${data[target.id].length}** vouches.`),
      ],
    });
    return true;
  }

  // ── /clearvouches (admin) ────────────────────────────────────
  if (commandName === "clearvouches") {
    const target = interaction.options.getUser("user");
    const count = countVouches(data, target.id);
    delete data[target.id];
    save(data);
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xe63946)
          .setDescription(`Slettet alle **${count}** vouches for ${target.username}.`),
      ],
    });
    return true;
  }

  return false;
}

function errEmbed(msg) {
  return new EmbedBuilder().setColor(0xe63946).setDescription(`❌ ${msg}`);
}
