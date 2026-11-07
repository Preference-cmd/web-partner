# Changelog

All notable changes to Partner are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
the project follows [Conventional Commits](https://www.conventionalcommits.org/).
An entry is written when a change is user-visible — a behavior, route, API
shape, stored format or deploy requirement — not for every commit. A breaking
change states its migration at the top of the release it ships in.

## [Unreleased]

### Added

- Repository workflow: pnpm workspace layout, `AGENTS.md` as the agent entry
  point, lefthook hooks, a Biome lint/format gate, Conventional Commits
  enforced by commitlint, and a GitHub Actions gate that mirrors `pnpm check`.
- A manually dispatched Workers deploy workflow, inert until an app and its
  `wrangler.jsonc` exist.
- An open proposal for the stack, kept with the other working material under
  `.agents/pipelines/` (not part of the repository).
- A chat island on `/`: demo replies stream token by token, three quick
  actions answer locally, a stop control keeps the partial reply, and history
  persists in this browser (`partner.chat.v1`, 100 messages). Replies are
  signed with the character name; only a fallback carries a `模板回复` mark.
  The live path falls back to a template until `/api/chat` exists.
- Client-side navigation between `/` and `/settings` (`ClientRouter`), so a
  running reply survives the page change; a full reload marks it interrupted.
- `POST /api/chat`: streams a reply from a user-supplied OpenAI-compatible
  https endpoint through the Vercel AI SDK. The route rejects non-https, IP
  literal, `localhost`, `.local` and `.internal` targets, cross-origin
  callers, bodies over 32 KB and turns over 21 messages; it never logs the key.
  The browser receives a plain text chunk stream, and an upstream failure that
  arrives as an empty stream falls back to a template.
- A settings island on `/settings`: connection (endpoint, model, key, direct
  toggle), mode (demo / live / forced demo, with the reason the current one is
  in force), appearance (panel opacity 0.4–0.9, motion preference), per-item
  data clearing and an about block. Every change saves as it is made, the
  sidebar mode chip follows it, and the chat page picks it up on the next
  message.
- A character on the stage: four 512×512 poses (idle / happy / shy / sleepy)
  drawn on a Canvas 2D canvas. The chat's emotion picks the pose, the figure
  breathes in 28 slices, sways 0.6° around its feet, holds each mood for two
  seconds and crossfades for 350 ms. Reduced motion freezes it, DPR is capped
  at 2, and the loop pauses while the tab is hidden.
- Character art under `apps/web/public/character/`: four CC BY-NC-SA 4.0
  poses with attribution (`ATTRIBUTION.md`) and the license text beside them,
  plus a root `NOTICE.md` that separates the private code from the
  non-commercial art. The sidebar license line links to the attribution.

### Changed

- `partner.settings.v1` also stores `panelAlpha` and `motion`. The addition is
  compatible: a record without them loads with the defaults (0.62, system), so
  no migration is needed. The API key still lives only in `sessionStorage`
  (`partner.secret.v1`).
- The floating chat panel caps at `min(72vh, 720px)` and 760px wide, so a
  conversation shows about four replies instead of two and a half, and it
  still shrinks to its content when short. The chat island publishes
  `--panel-h` and `--panel-lift` on the root element and the stage figure
  rides the lift; phones cap the panel at 52vh and dim the stage behind the
  sidebar overlay.
- The stage figure sizes to the viewport (480px tall on desktop, 360px on
  phones) and rides the lift further: `--panel-lift` caps at 250px and
  phones lift earlier, so the character peeks above a full-height panel
  instead of disappearing behind it. The placeholder orb and its build note
  are gone.
- Keyboard: every control shows a 3px focus ring at 3:1 against the panel,
  `Cmd/Ctrl+K` or `/` focuses the composer, the scrollable message log is
  focusable and announces reply completion (and interruption) through a polite
  status line, and the closed debug drawer is no longer in the tab order.
- Chat copy and actions: the header carries the name, the current mood and
  the mode in force, while each reply is signed with the character name and
  only a fallback is labelled; "新对话" asks before discarding a conversation
  with user messages (from any page), "清空" is disabled with nothing to
  clear, an empty log explains itself, and an interrupted reply with no text
  is a note rather than an empty bubble.
- The composer's decorative attach button is gone until uploads exist, the
  sidebar names the local user instead of a hard-coded person, the version
  label lives only in the settings about block, and the toggle icons are
  inline SVG instead of platform glyphs.
- The interface is rebuilt on shadcn/ui with a Tailwind token layer (neutral
  dark, `--radius` 0.625rem). The sidebar, chat panel, settings page and debug
  panel are React islands built from the default components, and the
  hand-written stylesheet is gone. Routes, storage keys (`partner.chat.v1`,
  `partner.settings.v1`, `partner.secret.v1`), the chat controller and the
  `--panel-h`/`--panel-lift` geometry are unchanged, so nothing migrates.
- Destructive actions ask in a dialog instead of `window.confirm`: clearing
  the conversation, clearing local history, removing the API key and restoring
  defaults.
- Saving is confirmed by a toast instead of the inline chip in the settings
  status line; that line keeps the mode in force and the reason for it.
- On phones the sidebar and the debug panel open as sheets with a focus trap,
  Escape to close and a dimmed backdrop; the sidebar collapses to a floating
  trigger on desktop.
- The debug panel reads the live chat store (emotion, mode, message count)
  instead of fixed sample values; its forced emotion and lighting switches stay
  disabled until the controller exposes them.
- The conversation surface is rebuilt on AI Elements: a sticky-scroll log with a
  jump-to-latest button that stays clickable until the scroll lands, a copy
  action per reply that appears on hover or focus, a composer that distinguishes
  ready / streaming / stopped, and a loader while a reply has no text yet.
  Replies stay plain text; only a fallback is labelled.
- One dependency came with it: `use-stick-to-bottom` owns the follow-the-bottom
  scroll. The registry's attachments, model picker, slash commands, branch
  controls and Streamdown markdown renderer were left out, so no markdown
  rendering, no uploads and no model switching appear.

- The stand-in stage consumes the chat's emotion: the figure takes a mood
  filter, the aura takes a mood colour, the breath slows when sleepy, and the
  panel names the mood beside the character. The build-time placeholder line
  moved into the debug panel.
- The live-mode switch and its status line now agree: the line names the
  effective mode and the stored choice ("演示模式 · 已选实时，还没填端点"),
  and the switch explains what is still missing instead of relying on a
  toast. "实际" became "实时"; the fallback label "回落" became "模板回复".
- Focus and type floors: the ring token clears 3:1, "/" gained an sr-only
  heading, 10px metadata became 12px, the licence line lost its extra fade,
  and settings toasts moved to the bottom-right so they no longer cover the
  page title.

### Notes

- The live path uses the AI SDK on the Worker and a plain text stream to the
  browser; direct mode still reads the endpoint's OpenAI SSE. The character
  renderer is still to come; the lighting theme row in the settings is a
  placeholder until it lands.
