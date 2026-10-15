# Wizox License Site

Admin panel + key check API, running as a Cloudflare Worker (free, always online, no PC needed).

- `https://license.seekboosting.lol/admin` – log in, generate / revoke / delete keys, reset HWID
- `POST https://license.seekboosting.lol/api/verify` – the client checks a key here

## Put it online (one time, on Windows)

Needs Node.js from https://nodejs.org. Open PowerShell in the `license-site` folder and run these one at a time:

```
npm install
npx wrangler login
npx wrangler kv namespace create KEYS
```

Copy the `id` it prints into `wrangler.toml` (replace `REPLACE_WITH_YOUR_KV_ID`). Then:

```
npx wrangler secret put ADMIN_PASSWORD
```

Type the password you want for the admin page. Then, in the Cloudflare dashboard → seekboosting.lol → **DNS**,
delete the old `license` record (the one pointing at the dead tunnel). Finally:

```
npx wrangler deploy
```

Done – open https://license.seekboosting.lol/admin.

## How keys work

- Format: `WIZOX-XXXX-XXXX-XXXX-XXXX`
- Duration (1/7/30/90/365 days or lifetime) starts counting the **first time** the key is used.
- With HWID lock on, the first PC that uses the key owns it. Use **Reset HWID** to let the buyer move PCs.

## Client check

```
POST /api/verify
{"key": "WIZOX-....", "hwid": "<unique id of this PC>"}
```

Reply: `{"valid": true, "expiresAt": 1730000000000}` or `{"valid": false, "reason": "..."}` where reason is one of
`invalid_key`, `revoked`, `expired`, `hwid_mismatch`, `missing_key`, `missing_hwid`.
