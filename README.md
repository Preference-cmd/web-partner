# Partner

A web application deployed to Cloudflare Workers.

**Status: a chat demo with a drawn character.**
`apps/web` is an Astro app — a static shell, React islands on shadcn/ui and AI
Elements, and a Canvas 2D character on a full-bleed stage.

- **Chat** at `/`: demo replies stream token by token; once an
  OpenAI-compatible endpoint and key are set in settings, replies come from
  `POST /api/chat` instead, and a failed upstream falls back to a template.
- **Conversations** in the sidebar: up to 20 sessions of 100 messages each,
  kept on this device — start, switch, rename inline, delete.
- **Character stage**: four poses picked by the reply's emotion; the figure
  breathes and sways and holds each mood for two seconds before the next
  crossfade.
- **Settings** at `/settings`: endpoint, model, mode, the session-only key and
  the chat panel's appearance.
- **Debug drawer** on the chat stage: the turn, drawn pose, renderer, FPS and
  mode, the last 50 log lines, a forced mood, four stage lights, two draw modes
  and a line above the character.

There is no account system: `/login` is a placeholder page, and no request
leaves the browser except the chat call to the endpoint you configure.

The stack decision lives in the local proposal under `.agents/pipelines/`,
which is not part of this repository.

## Getting started

```text
pnpm install          # installs dependencies and the git hooks
pnpm dev              # Astro dev server on the Workers runtime
pnpm check            # the gate: lint, typecheck, test, build
```

`pnpm` 10.30.3 and Node 24 are pinned in `package.json` and `.nvmrc`.

## Repository shape

```text
apps/web     Astro app — static pages, React islands (sidebar, chat, settings, debug), Worker shell; one wrangler.jsonc
packages/*   code shared between apps (not created yet)
```

## What stays in this browser

The server stores nothing; every key below lives on this device.

| key | contents |
| --- | --- |
| `partner.sessions.v1` | conversation index: the active session, titles and timestamps |
| `partner.session.<id>.v1` | one transcript: messages and a marker for an interrupted reply |
| `partner.settings.v1` | endpoint, model, mode and the chat panel's appearance |
| `partner.secret.v1` | the API key, in `sessionStorage`: gone when the tab closes |
| `partner.panel.v1` | debug drawer: open state, light and renderer |

`partner.chat.v1` is the old single-conversation key: it is read once,
migrated into a session and removed.

## Working on it

[`AGENTS.md`](AGENTS.md) is the operating manual: layout, fact sources, the
exact command list CI runs, commit and branch rules, and the conventions code
is held to. Read it before the first change.

Checks run automatically: `pre-commit` formats and lints staged files,
`commit-msg` enforces Conventional Commits, `pre-push` typechecks and tests.
CI repeats the full gate and runs commitlint over the pushed range.

## Deploying

`Deploy` (`.github/workflows/deploy.yml`) is manual and never runs on a
push: it checks the app, builds it and uploads `apps/web` as the Worker
`partner-web`. It needs the repository secrets `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID`, and runs from the repository's **Actions → Deploy →
Run workflow**.

The Worker holds no runtime secret: the chat proxy forwards the endpoint and
key the browser sends (bring your own key).

A release is ready when `pnpm check` passes and the deployed Worker answers
`/` and `/settings/` with 200, serves the character art as `image/webp`, and
rejects an empty `POST /api/chat` with 400. `wrangler rollback` returns to the
previous version.

## License

Private — all rights reserved. The character art in
`apps/web/public/character/` is the exception: it is licensed CC BY-NC-SA 4.0
for this non-commercial demo. See `NOTICE.md` and
`apps/web/public/character/ATTRIBUTION.md`.
