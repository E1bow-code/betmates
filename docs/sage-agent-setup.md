# Sage: fact-checked idea proposals → Discord approve/reject → GitHub issue

Sage researches one idea a day to grow or improve BetMates — grounded in real,
cited web sources — posts it to your Discord with **Approve / Reject** buttons,
and (when you approve, if GitHub is configured) logs it as an issue.

Nothing here runs until the credentials below are set. With them unset every
piece no-ops (the same "missing keys degrade, don't crash" contract as the rest
of the app), so merging this changes nothing until you opt in.

## Pieces

| File | Role |
|---|---|
| `src/lib/sageResearch.js` | the prompt, the web-search request, and response parsing (pure, tested) |
| `netlify/functions/sage-propose.js` | cron: research → store `pending` → post buttons |
| `netlify/functions/discord-interactions.js` | button endpoint: flip row → open issue (shared with Coco) |
| `idea_proposals` table | the proposal queue (`supabase/schema.sql`) |

## 1. Apply the schema

The `idea_proposals` block in `supabase/schema.sql` only takes effect once
applied to the live database. Apply that block (Supabase SQL editor or your
migration flow).

## 2. Reuse the Discord app

Sage shares the Discord application, bot token, channel and interactions
endpoint that Coco uses — set those up once per **[Coco's guide](./social-agent-setup.md)**
(steps 2 and the `DISCORD_*` env vars). The same `discord-interactions.js`
endpoint handles both Coco's `sp:` buttons and Sage's `ip:` buttons.

## 3. The Claude key (research)

Sage calls Claude with the `web_search` server tool. It reuses the Coach's
Anthropic credentials rather than adding a second key:

- **Direct Anthropic:** set `COACH_ANTHROPIC_KEY`.
- **Via OmniRoute:** set `OMNIROUTE_BASE_URL` (+ `OMNIROUTE_API_KEY`,
  `OMNIROUTE_MODEL_PREFIX`) and Sage routes through it, same as the Coach.

With neither set, `sage-propose` no-ops.

## 4. (Optional) GitHub issue logging

To have an approved idea opened as a GitHub issue automatically:

```
SAGE_GITHUB_TOKEN = <a token with repo issues:write>
SAGE_GITHUB_REPO  = owner/repo
```

Unset, an approval is still recorded in `idea_proposals` — it just doesn't open
an issue.

## Flow, once configured

`sage-propose` (daily 08:00 UTC) asks Claude to research and write one cited
idea, stores it `pending`, and posts it to your channel with the sources and
buttons → you tap **Approve** or **Reject** → `discord-interactions` verifies
the click, updates the row, and on approve opens a GitHub issue (if configured)
and edits the message to show the link. Reject just discards it. A second click
is idempotent.

The cadence is `0 8 * * *` (an hour before Coco's post); change the
`config.schedule` in `sage-propose.js` to research more or less often.
