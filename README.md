# Partner

[![CI](https://github.com/Preference-cmd/web-partner/actions/workflows/ci.yml/badge.svg)](https://github.com/Preference-cmd/web-partner/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**伴侣小生命** — a local-first AI companion demo. A drawn character, 小鲸, stands
on a dark stage; a chat panel floats in front of her. It answers from local
templates by default; point it at an OpenAI-compatible endpoint in settings and
switch to live mode to talk to your own model. Conversations, settings and the
key stay in the browser.

[**Live demo**](https://partner-web.sq103832.workers.dev) · [Getting started](#getting-started) · [Bring your own model](#bring-your-own-model) · [Deploying](#deploying) · [License](#license)

![The character above the chat panel](docs/screenshot-chat.jpg)

## Features

- **A character that reacts.** Four 512×512 poses (idle, happy, shy, sleepy) are
  drawn on a Canvas 2D canvas and breathe, sway and crossfade with the mood.
- **Chat that works before setup.** Demo replies stream from local templates,
  and three quick actions answer without a model.
- **Bring your own model.** Any OpenAI-compatible endpoint works through the
  Worker, or directly from the browser for a local model.
- **Twenty conversations on this device.** Up to 20 sessions of 100 messages are
  kept in the browser, with switch, inline rename, delete and a one-time
  migration from `partner.chat.v1`.
- **Settings and a debug drawer.** `/settings` holds the connection, the model
  call (output budget and context window), mode and appearance, while the drawer
  exposes the pose, FPS, log lines, forced moods and stage lighting.
- **Details that matter.** `Cmd/Ctrl+K` or `/` focuses the composer,
  destructive actions ask in dialogs, and the layout becomes sheets on phones.

## How it works

`apps/web` is an Astro 7 app on the Cloudflare adapter: static pages, React 19
islands on Tailwind 4 and shadcn/ui, a Canvas 2D character and a Zustand chat
controller. `POST /api/chat` streams from your endpoint through the Worker, or
the browser calls it directly in direct mode. Nothing is stored on the server,
and there is no analytics.

## Getting started

Node 24 (`.nvmrc`) and pnpm 12.18.0 are required.

```bash
pnpm install     # dependencies and git hooks
pnpm dev         # http://localhost:4321
pnpm check       # lint, typecheck, test, build
```

`pnpm dev` serves the app on the Workers runtime, including `/api/chat`.

## Bring your own model

1. Open `/settings`.
2. Enter the base URL without `/chat/completions`, the model name and the key.
3. Switch the mode to 实时; use 直连端点 for a local `http` endpoint or one that
   does not allow CORS.

The sidebar chip names the mode in force. The key lives in `sessionStorage` and
is gone when the tab closes; a failed upstream falls back to a labelled template
reply.

## Deploying

**Actions → Deploy → Run workflow** builds `apps/web` and uploads it as the
Worker `partner-web`. The repository secret `CLOUDFLARE_API_TOKEN` is required;
`CLOUDFLARE_ACCOUNT_ID` is optional and only needed when the token can see more
than one account. The demo runs at
<https://partner-web.sq103832.workers.dev>.

A release is ready when `pnpm check` passes and the deployed Worker serves `/`
and `/settings/` with 200. `wrangler rollback` returns to the previous version.

## License

The code is MIT (see [`LICENSE`](LICENSE)). The character art is
**CC BY-NC-SA 4.0**, non-commercial and share-alike, by Sutera-Diffusus based on
a character by 上善无形; see [`NOTICE.md`](NOTICE.md) and
[`ATTRIBUTION.md`](apps/web/public/character/ATTRIBUTION.md). The preview in
`docs/` shows the art and carries the same terms; replace the art before any
commercial use.
