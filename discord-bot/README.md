# Wizox announce bot

Adds an admin-only `/announce` slash command that posts a message and a link with an `@everyone` ping.

## Setup

1. Create an application at https://discord.com/developers/applications, add a bot, and copy its token.
2. Invite it with the `bot` and `applications.commands` scopes and the **Send Messages** and **Mention @everyone** permissions.
3. Run:

```sh
npm install
DISCORD_TOKEN=... npm start
```

## Usage

```
/announce link:https://example.com message:New update is out!
```

Only members with the **Mention @everyone** permission can use the command.
