import { createCanvas } from "@napi-rs/canvas";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ContainerBuilder,
  MediaGalleryBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
} from "discord.js";

const RED = 0xff2e43;
const { SUPPORT_ROLE_ID, TICKET_CATEGORY_ID, TICKET_LOG_CHANNEL_ID } = process.env;

// Ticket types. To use your own server emojis, replace an emoji with "<:name:id>".
const TYPES = {
  question: { label: "question", emoji: "❓", desc: "get help with a product" },
  robux: { label: "robux", emoji: "🪙", desc: "buy a key with robux" },
  payment: { label: "payment help", emoji: "💳", desc: "payment related questions" },
  hwid: { label: "hwid reset", emoji: "🔄", desc: "reset the PC your key is locked to" },
  transfer: { label: "key transfer", emoji: "🔑", desc: "move your key to another account" },
};

export const ticketCommands = [
  new SlashCommandBuilder()
    .setName("ticketpanel")
    .setDescription("Post the ticket panel in this channel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
];

async function banner() {
  const W = 1200;
  const H = 300;
  const c = createCanvas(W, H);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#141012";
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W / 2, H * 0.55, 0, W / 2, H * 0.55, W * 0.55);
  g.addColorStop(0, "rgba(255,46,67,0.28)");
  g.addColorStop(1, "rgba(20,16,18,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 112px 'Arial Black', 'Segoe UI Black', Arial, sans-serif";
  ctx.fillText("WIZOXHUB TICKETS", W / 2, 165, W - 80);
  ctx.font = "500 46px 'Segoe UI', Arial, sans-serif";
  ctx.fillText("CONTACT SUPPORT TEAM", W / 2, 232);

  const out = createCanvas(W, H);
  const o = out.getContext("2d");
  o.beginPath();
  o.roundRect(0, 0, W, H, 24);
  o.clip();
  o.drawImage(c, 0, 0);
  return out.encode("png");
}

async function panelMessage() {
  const file = new AttachmentBuilder(await banner(), { name: "tickets.png" });
  const list = ["question", "robux", "payment"]
    .map((k) => `${TYPES[k].emoji} **${TYPES[k].label}** — ${TYPES[k].desc}`)
    .join("\n");

  const box = new ContainerBuilder()
    .setAccentColor(RED)
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems((i) => i.setURL("attachment://tickets.png")))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**categories**\n${list}\n> please state what you need help with when opening a ticket`),
    )
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("ticket:hwid").setLabel("hwid reset").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("ticket:transfer").setLabel("key transfer").setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("ticket:select")
          .setPlaceholder("select the ticket category based on your request")
          .addOptions(
            ["question", "robux", "payment"].map((k) => ({
              label: TYPES[k].label.toUpperCase(),
              description: TYPES[k].desc,
              value: k,
              emoji: TYPES[k].emoji,
            })),
          ),
      ),
    );

  return { components: [box], files: [file], flags: MessageFlags.IsComponentsV2 };
}

function safeName(user) {
  return user.username.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 20) || user.id;
}

async function openTicket(interaction, type) {
  const { guild, user } = interaction;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // One open ticket per person.
  const channels = await guild.channels.fetch();
  const existing = channels.find((ch) => ch?.type === ChannelType.GuildText && ch.topic?.includes(`ticket-owner:${user.id}`));
  if (existing) return interaction.editReply(`You already have an open ticket: ${existing}`);

  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: user.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory],
    },
    {
      id: interaction.client.user.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory],
    },
  ];
  if (SUPPORT_ROLE_ID) {
    overwrites.push({
      id: SUPPORT_ROLE_ID,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory],
    });
  }

  // Only use TICKET_CATEGORY_ID if it really is a category; otherwise put tickets at the top level.
  let parent = null;
  if (TICKET_CATEGORY_ID) {
    const cat = channels.get(TICKET_CATEGORY_ID);
    if (cat?.type === ChannelType.GuildCategory) parent = cat.id;
    else console.warn(`TICKET_CATEGORY_ID ${TICKET_CATEGORY_ID} is not a category. Right-click a category (not a channel) → Copy Category ID.`);
  }

  const t = TYPES[type];
  const channel = await guild.channels.create({
    name: `${type}-${safeName(user)}`,
    type: ChannelType.GuildText,
    parent,
    topic: `${t.label} ticket · ticket-owner:${user.id}`,
    permissionOverwrites: overwrites,
  });

  const box = new ContainerBuilder()
    .setAccentColor(RED)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${t.emoji} ${t.label} ticket`),
      new TextDisplayBuilder().setContent(
        `Hey ${user}, thanks for opening a ticket.\nTell us what you need help with and a staff member will reply soon.`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("ticket:close").setLabel("Close ticket").setEmoji("🔒").setStyle(ButtonStyle.Danger),
      ),
    );

  await channel.send({
    components: [
      new TextDisplayBuilder().setContent(`${user}${SUPPORT_ROLE_ID ? ` <@&${SUPPORT_ROLE_ID}>` : ""}`),
      box,
    ],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { users: [user.id], roles: SUPPORT_ROLE_ID ? [SUPPORT_ROLE_ID] : [] },
  });

  await interaction.editReply(`Your ticket is open: ${channel}`);
}

async function closeTicket(interaction) {
  const ch = interaction.channel;
  const owner = ch.topic?.match(/ticket-owner:(\d+)/)?.[1];
  if (!owner) return interaction.reply({ content: "This isn't a ticket channel.", flags: MessageFlags.Ephemeral });

  const isStaff =
    interaction.memberPermissions.has(PermissionFlagsBits.ManageChannels) ||
    (SUPPORT_ROLE_ID && interaction.member.roles.cache.has(SUPPORT_ROLE_ID));
  if (interaction.user.id !== owner && !isStaff) {
    return interaction.reply({ content: "Only the ticket owner or staff can close this.", flags: MessageFlags.Ephemeral });
  }

  await interaction.reply(`🔒 Ticket closed by ${interaction.user}. This channel will be deleted in 5 seconds.`);

  if (TICKET_LOG_CHANNEL_ID) {
    const log = await interaction.guild.channels.fetch(TICKET_LOG_CHANNEL_ID).catch(() => null);
    await log?.send({
      content: `🔒 **#${ch.name}** (owner <@${owner}>) was closed by ${interaction.user}.`,
      allowedMentions: { parse: [] },
    }).catch(() => {});
  }
  setTimeout(() => ch.delete("Ticket closed").catch(() => {}), 5000);
}

// Returns true if it handled the interaction.
export async function handleTicketInteraction(interaction) {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === "ticketpanel") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await interaction.channel.send(await panelMessage());
      await interaction.editReply("Ticket panel posted.");
      return true;
    }
    if (interaction.isStringSelectMenu() && interaction.customId === "ticket:select") {
      await openTicket(interaction, interaction.values[0]);
      return true;
    }
    if (interaction.isButton() && interaction.customId === "ticket:close") {
      await closeTicket(interaction);
      return true;
    }
    if (interaction.isButton() && (interaction.customId === "ticket:hwid" || interaction.customId === "ticket:transfer")) {
      await openTicket(interaction, interaction.customId.split(":")[1]);
      return true;
    }
  } catch (e) {
    console.error("Ticket error:", e);
    const msg = `Something went wrong: ${e.message}. Check that the bot has **Manage Channels** and **Manage Roles**.`;
    if (interaction.deferred || interaction.replied) await interaction.editReply(msg).catch(() => {});
    else await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
    return true;
  }
  return false;
}

export { panelMessage };
