# Wizoxhub Bot

Welcomes new members: pings them in your welcome channel with a blue card showing their avatar,
"Welcome @name" and their member number.

## 1. Create the bot (once)

1. Go to https://discord.com/developers/applications → **New Application** → name it `Wizoxhub`.
2. **Bot** tab:
   - Click **Reset Token** and copy it (keep it secret).
   - Turn on **Server Members Intent**. Without this the bot never sees anyone join.
3. **OAuth2 → URL Generator**: tick `bot` and `applications.commands`, then under bot permissions tick
   **Send Messages**, **Embed Links** and **Attach Files**. Open the link at the bottom and add the bot to your server.

## 2. Run it

Needs Node.js 18 or newer (https://nodejs.org). In this folder:

```
npm install
copy .env.example .env      (Mac/Linux: cp .env.example .env)
```

Open `.env` in Notepad and fill in:

- `DISCORD_TOKEN` – the token from step 1
- `WELCOME_CHANNEL_ID` – in Discord, turn on **Settings → Advanced → Developer Mode**, then right-click
  your welcome channel → **Copy Channel ID**

Then start it:

```
npm start
```

You'll see `Wizoxhub is online`. Type `/testwelcome` in your server to see the message without anyone joining
(only people with Manage Server can use it).

The bot only works while this window is open. To keep it online 24/7, run it on a host such as
a VPS, Railway or a Raspberry Pi.

## Change the look

- Colours and layout of the card: `src/card.js`
- Message text and embed colour: `buildWelcome` in `src/index.js`
- See the card without Discord: `npm run preview` (saves `preview.png`; add a path to test your own avatar,
  e.g. `npm run preview my-avatar.png`)

## Tickets

`/ticketpanel` (Manage Server only) posts the support panel in the channel you type it in:
a banner, the categories, **hwid reset** / **key transfer** buttons and a dropdown for
**question / robux / payment help**.

Picking one creates a private channel only the member, your support role and the bot can see,
with a **Close ticket** button. Each member can have one open ticket at a time.

Add to `.env`:

- `SUPPORT_ROLE_ID` – the staff role that answers tickets
- `TICKET_CATEGORY_ID` – optional, category the ticket channels go in
- `TICKET_LOG_CHANNEL_ID` – optional, where closed tickets are noted

The bot needs **Manage Channels** and **Manage Roles** for tickets. Use your own server emojis by editing
`TYPES` at the top of `src/tickets.js` (e.g. `emoji: "<:robux:123456789>"`).

## Auto role

Everyone who joins gets the role in `AUTO_ROLE_ID` (default: your Members role). If your server makes people
accept the rules first, they get it right after accepting.

For this to work the bot needs **Manage Roles**, and in **Server Settings → Roles** the bot's role must be
dragged **above** the Members role.
