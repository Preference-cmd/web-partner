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
- Conversations on this device: the sidebar lists up to 20 sessions with a
  title taken from the first message and when it was last used; a new
  conversation no longer needs a confirmation, switching keeps each transcript
  and its mood, renaming is inline, deleting asks first, and the debug drawer
  logs every session action.
- A chat island on `/`: demo replies stream token by token, three quick
  actions answer locally, a stop control keeps the partial reply, and history
  persists in this browser (`partner.chat.v1`, 100 messages). Replies are
  signed with the character name; only a fallback carries a `模板回复` mark.
  The live path falls back to a template until `/api/chat` exists.
- Client-side navigation (`ClientRouter`) keeps a running reply alive across a
  page change; a full reload marks it interrupted.
- `POST /api/chat`: streams a reply from a user-supplied OpenAI-compatible
  https endpoint through the Vercel AI SDK. The route rejects non-https, IP
  literal, `localhost`, `.local` and `.internal` targets, cross-origin
  callers, bodies over 512 KB and turns over 201 messages; it never logs the key.
  The browser receives a plain text chunk stream, and an upstream failure that
  arrives as an empty stream falls back to a template.
- A settings dialog over the chat (sidebar → 设置, or `/?settings=1`), laid
  out as a sectioned window with a side nav: connection (endpoint, model, key,
  direct toggle), model call (output budget 64–4096 tokens, default 1024;
  context window 1000–32000 estimated tokens, default 4000), mode (demo /
  live / forced demo, with the reason the current one is in force),
  appearance (panel opacity 0.4–0.9, motion preference), per-item data
  clearing and an about block. Every change saves as it is made, the sidebar
  mode chip follows it, and the chat page picks it up on the next message.
- A character on the stage: four 512×512 poses (idle / happy / shy / sleepy)
  drawn on a Canvas 2D canvas. The chat's emotion picks the pose, the figure
  breathes in 28 slices, sways 0.6° around its feet, holds each mood for two
  seconds and crossfades for 350 ms. Reduced motion freezes it, DPR is capped
  at 2, and the loop pauses while the tab is hidden.
- Character art under `apps/web/public/character/`: four CC BY-NC-SA 4.0
  poses with attribution (`ATTRIBUTION.md`) and the license text beside them,
  plus a root `NOTICE.md` that separates the private code from the
  non-commercial art. The sidebar license line links to the attribution.
- A debug drawer on `/`: status (turn, character state, mood, drawn pose,
  renderer, FPS, DPR, mode), the last 50 log lines across seven sources with a
  clear control, forced moods, four stage lights, a renderer switch and a stage
  bubble. The mode switch shares `partner.settings.v1` with the settings page;
  the open state, light and renderer persist in `partner.panel.v1`, while the
  log is memory only and a reload starts it empty.
- A stage bubble: one line above the character, printed by the debug drawer,
  gone after ten seconds, without touching the chat, the model or the mood.
- Attachments: up to four images (1 MB each) or plain-text files (64 KB each)
  can be added, pasted or picked in the composer. Images travel inline as
  content parts through `/api/chat`; the transcript keeps only each file's
  name, type and size, so opening the conversation again shows them marked
  已过期 instead of quietly dropping them.
- Model presets and thinking intensity. Settings can store up to eight model
  names for the current endpoint and choose how hard a reasoning model should
  think (关 / 最低 / 低 / 中 / 高), which the request carries as
  `reasoning_effort`; the composer shows a model menu and an effort menu, and
  switching either writes the setting the next request reads. On phones the two
  menus collapse into one. The output budget stays its own number, because
  thinking spends it. A setting saved before this change kept the effort as a
  token budget: it is migrated on read, the number moves to the output budget
  and the effort starts at 关, so the first request after an update is
  byte-for-byte what the previous version sent.
- A connection test in settings: one minimal non-streaming turn through the
  same path the chat uses, answered as 通过 / key 被拒 / 端点不可达 / 未填完 with a
  reason. It writes nothing, retries nothing and never logs the key.
- The character is part of the interface: the figure is a button (a tap is a
  head pat, a held press or Enter says a line from the stage bubble), every reply
  drops its first sentence onto the stage unless 外观 → 回复回声 is off, the
  composer's placeholder follows her mood, and 外观 now owns the four stage
  lights, kept in step with the debug drawer through `partner.panel.v1`.
- On a phone the primary controls answer to a thumb: send and stop, the fold and
  clear controls, quick actions, the drawer button, the debug button, session
  rename/delete and every sheet close are at least 44×44, and the quick actions
  stay reachable with the transcript folded. The panel keeps clear of the notch
  (`env(safe-area-inset-bottom)`) and rises above the on-screen keyboard by
  watching `visualViewport`.
- The conversation panel can be resized: drag its top edge, nudge it with the
  arrow keys (Home / End jump to the limits, Enter goes back to automatic), or
  double-click the handle. The height is stored in `partner.settings.v1` as
  `panelHeight` and is ignored on phones, where the panel stays bottom-anchored.
- Providers replace the single endpoint. Settings holds up to eight providers,
  each one a base URL, a protocol, a key, up to eight model names and the
  thinking levels it accepts; the composer's model menu groups models by
  provider and the 努力 menu offers only the levels that provider enabled. Keys
  live per provider in `partner.secrets.v1` (sessionStorage) and are gone when
  the tab closes; `partner.settings.v1` now stores `providers`,
  `activeProviderId` and `activeModel`. A settings file from before providers
  existed is read as one provider named after its host — with its models, direct
  flag, thinking level and the old single key — so the first request after the
  update is what the previous version sent.
- The settings dialog is a two-pane window: a grouped rail (接入 / 应用 / 其他) on
  the left, a scrolling column on the right, and the rail follows the scroll.
  On a phone the rail becomes one row of chips. The provider dialog holds the
  whole supplier — name, protocol, base URL, proxy or direct, key, models and
  thinking levels — and 验证并保存 sends one ping with the values still on screen
  before saving; a failed test can still be saved with 仍然保存 or 直接保存.

### Fixed

- An endpoint that accepts the connection and never answers no longer leaves
  the reply streaming forever: the proxy gives up after eight seconds and the
  turn falls back to a template reply marked 模板回复, like any other empty
  stream.
- The stage light sits under the character instead of 210 px to her left: the
  aura's breathing keyframe no longer repeats the centring transform Tailwind
  already applies.
- A longer conversation no longer buries the character: the panel stops growing
  once the figure would fall below 55% visible on desktop and 60% on phones, and
  scrolls the transcript instead. The figure also stops at the top edge instead
  of sliding under the browser chrome.
- A message made of one long token (a URL, a key, a hash) wraps inside its
  bubble instead of being clipped at the edge.

### Changed

- The character is now six frame sequences instead of four still poses: idle
  loops 1.1 s with a blink and a tail swing, entering or a head pat waves, happy
  jumps, shy looks down, a sleepy or in-flight reply waits, and a fallback reply
  gets a failed take. State changes crossfade for 180 ms and keep the two-second
  dwell; reduced motion and the static renderer hold one frame. The four
  512×512 poses are removed. The frames are cropped from
  `codex-pet-DeepSeek-girl` by xpy12367, a repository without a license; the
  earlier `dsh-whale-musume` credit stays for the character lineage. The project
  claims no ownership of the art and prohibits commercial use.
- Settings shows one section at a time instead of one long scroll: the side nav
  and the phone chips are real tabs (arrow keys, Home/End, roving focus), the
  mode status stays visible above every section, and the about rows live at the
  end of 数据. Old hashes such as `#model` and `#about` still open the owning
  section. Opening the dialog focuses the selected tab; Esc still returns focus
  to the button that opened it.
- The settings dialog matches the rest of the UI now: the section nav, live
  status dot, active provider and selected model use the brand blue instead of
  neutral grey or emerald; segmented controls and secondary actions drop their
  outlines for tinted fills; row descriptions step down to 12px. The dialog
  header, sidebar footer and empty state no longer repeat the same explanation
  of what a provider is.
- The visual baseline is the character's blue now: `--brand` fills the send
  control, the active session, the focus ring, the idle mood dot and the live
  mode chip. The four stage lights also tint the panel and sidebar surfaces, so
  switching a light changes the whole screen instead of the backdrop alone.
  Muted text stays above 4.5:1 on the panel in every light (6.27–6.75:1).
- The mode badge lives only in the sidebar now; the panel header keeps the
  character name and mood. In demo mode the composer offers one 接入模型 entry
  instead of an unused model menu. On phones the composer's bottom row holds
  only the attachment and send controls, with model and effort in a row above
  the input; quick actions fold to two plus 更多, keeping all three wordings.
- Copy that described unfinished plans is gone: the login page states that the
  demo has no account system, and the settings page no longer shows a lighting
  row that only pointed at the debug drawer.
- `/api/chat` takes an optional `protocol` and speaks only `openai`: any
  other value is rejected with 400 before an upstream call, and direct mode
  stays OpenAI-shaped. The provider dialog's protocol select marks Anthropic
  Messages as not wired up yet.
- `/api/chat` accepts content parts (text plus base64 images), an optional
  `reasoningEffort` level, a `probe: true` flag that answers a JSON verdict
  instead of a stream, and raises the request body cap from 512 KB to 2 MB;
  a text part keeps the 2 KB limit, an image must be a base64 data URL of a
  supported type and at most 1 MB.
- The composer follows the shadcn Prompt Input shape: one rounded input
  group, a p-3 text area, pill-shaped controls and an ArrowUp send button.
  Exports keep their names, so the chat panel only changes how it composes them.
- Settings reads as a three-step path — 连接, 测试连接, 模式与外观 — with the
  model-call numbers, model presets, data and about under 更多. Each step keeps a
  link (`?settings=1#test`), the nav marks the current step with `aria-current`,
  fields confirm with an inline 已保存, and the close button, switches and slider
  thumb now answer to a 44px target while Esc returns focus to the button that
  opened the dialog.
- Settings is a dialog now: the sidebar 设置 button and the debug drawer open
  it over the chat with a blurred backdrop, without leaving the conversation,
  and Esc, the close button or the backdrop dismiss it. `/settings` stays as a
  static redirect to `/?settings=1`, so old links keep working; the chat page
  opens the dialog when that parameter is present.
- The deploy workflow now targets the single `partner-web` Worker and needs
  only `CLOUDFLARE_API_TOKEN`: the `environment` input and `--env` are gone, and
  `CLOUDFLARE_ACCOUNT_ID` is optional when the token can see one account.
- The code is MIT-licensed (`LICENSE`). The character art in
  `apps/web/public/character/` stays outside that grant, under CC BY-NC-SA 4.0;
  `NOTICE.md` states the boundary. No behaviour changes.
- Stored history moved from one record to a session index:
  `partner.sessions.v1` holds `{ activeId, sessions }` and
  `partner.session.<id>.v1` holds one transcript. An existing
  `partner.chat.v1` is migrated into a session on the first load and the old
  key is deleted; a legacy record that only holds the greeting is dropped. No
  action is needed from the user.
- "新对话" starts a new conversation instead of offering to wipe the open one,
  and reuses the open conversation while it has no user message; the sidebar
  link still works without JavaScript through `/?new=1`. "清空" empties the
  open conversation but keeps it in the list, while "清空对话历史" in settings
  removes every conversation and starts a fresh one.

- `partner.settings.v1` also stores `panelAlpha` and `motion`. The addition is
  compatible: a record without them loads with the defaults (0.62, system), so
  no migration is needed. The API key still lives only in `sessionStorage`
  (`partner.secret.v1`).
- The LLM call is parameterised instead of hard-coded: the reply budget
  (`max_tokens`, default 1024, range 64–4096 tokens) and the context window
  (1000–32000 estimated tokens, default 4000) come from `/settings` and reach
  both transports, and `POST /api/chat` clamps the budget again. The window
  counts CJK at about 1.5 characters per token and other text at about 4, so
  it is an estimate, not a tokenizer; the 6000-character trim is gone. The
  proxy accepts up to 512 KB and 201 messages so a full window fits, and a
  reasoning endpoint no longer has its reply cut in half at 120 tokens.
- The stored settings record names the context window `contextTokens`; a
  record from the message-count version has no such field and loads with the
  token default, so no migration is needed.
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
- The stage backdrop, its vignette and the drifting dust follow four lighting
  presets (`data-light` on the root element). Each colour is a registered
  custom property, so a preset crossfades in 600 ms instead of cutting.
- The character renderer takes a kind: `canvas2d` animates and samples FPS,
  `static` draws one frame and stops the loop. Switching remounts the stage
  with the mood kept, and the loop publishes `data-pose`, `data-renderer` and
  a one-second FPS sample for the debug drawer; crossfade, dwell and reduced
  motion behave as before.
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
