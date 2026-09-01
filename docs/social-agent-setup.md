# Coco: daily-post proposals → Discord approve/reject → X

Coco drafts one promo post a day, posts it to your Discord with **Approve /
Reject** buttons, and — when you approve — publishes it to X (Twitter).

Nothing here runs until the credentials below are set. With them unset every
piece no-ops (the same "missing keys degrade, don't crash" contract as the rest
of the app), so merging this changes nothing until you opt in.

## Pieces

| File | Role |
|---|---|
| `src/lib/socialDraft.js` | composes the post text from real data (pure, tested) |
| `src/lib/xClient.js` | posts a tweet via X API v2 + OAuth 1.0a (tested) |
| `src/lib/discordVerify.js` | verifies Discord's request signature (tested) |
| `netlify/functions/social-propose.js` | cron: draft → store `pending` → post buttons |
| `netlify/functions/discord-interactions.js` | button endpoint: flip row → publish to X |
| `social_posts` table | the proposal queue (`supabase/schema.sql`) |

## 1. Apply the schema

The `social_posts` block in `supabase/schema.sql` only takes effect once applied
to the live database. Apply that block (Supabase SQL editor or your migration
flow).

## 2. Create the Discord application (buttons + endpoint)

1. https://discord.com/developers/applications → **New Application**.
2. **Bot** tab → **Add Bot** → **Reset Token** → copy the **bot token** → this is `DISCORD_BOT_TOKEN`.
3. **OAuth2 → URL generator** → scopes `bot` + `applications.commands`, bot
   permission **Send Messages** → open the URL → add the bot to your server.
4. In Discord, enable Developer Mode (User Settings → Advanced), right-click the
   target channel → **Copy Channel ID** → this is `DISCORD_CHANNEL_ID`.
5. **General Information** tab → copy the **Public Key** → this is `DISCORD_PUBLIC_KEY`.
6. Deploy this branch so `/.netlify/functions/discord-interactions` exists, then
   back in **General Information** set **Interactions Endpoint URL** to
   `https://<your-site>/.netlify/functions/discord-interactions` and **Save**.
   Discord sends a signed PING; the endpoint answers PONG, so it saves only once
   `DISCORD_PUBLIC_KEY` is set in Netlify and the site is deployed.

## 3. Create the X app (publishing)

1. https://developer.x.com → create a Project + App. The **Free** tier allows
   ~500 posts/month (write) — plenty for a daily post.
2. App settings → **User authentication** → enable OAuth 1.0a, app permission
   **Read and write**.
3. **Keys and tokens** → copy **API Key/Secret** (`X_API_KEY`, `X_API_SECRET`)
   and generate **Access Token/Secret** (`X_ACCESS_TOKEN`, `X_ACCESS_SECRET`)
   for the account that should post. Regenerate the access token after switching
   the app to Read-and-write, or it stays read-only.

## 4. Set the environment variables (Netlify)

Site configuration → Environment variables:

```
DISCORD_BOT_TOKEN     = <bot token>
DISCORD_CHANNEL_ID    = <channel id>
DISCORD_PUBLIC_KEY    = <app public key>
X_API_KEY             = <x api key>
X_API_SECRET          = <x api secret>
X_ACCESS_TOKEN        = <x access token>
X_ACCESS_SECRET       = <x access secret>
```

Redeploy so the functions pick them up. (`DISCORD_WEBHOOK_URL` from the earlier
notifier work is separate and still used by the other agent signals.)

## Flow, once configured

`social-propose` (daily 09:00 UTC) drafts a post, stores it `pending`, and posts
it to your channel with buttons → you tap **Approve & post** or **Reject** →
`discord-interactions` verifies the click, updates the row, and on approve
publishes to X and edits the message to show the tweet link. Reject just
discards it. A second click is idempotent.

The cadence is `0 9 * * *`; change the `config.schedule` in
`social-propose.js` to post more or less often.
