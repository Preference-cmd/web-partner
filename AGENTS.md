# AGENTS.md — Partner

> The agent entry point for this repository. `CLAUDE.md` is a symlink to this
> file — edit here only. If `AGENTS.local.md` exists, it holds machine-local
> rules; it loads after this file and takes precedence where the two differ.

**Partner** is a browser companion with a drawn character and a chat panel,
deployed as one Cloudflare Worker. The product is `apps/web`: an Astro 7 shell
with React 19 islands, a Canvas 2D character, a Zustand chat controller, and a
Worker route that proxies one OpenAI-compatible request. Nothing is stored on
the server; conversations, settings and the API key stay in the visitor's
browser.

`README.md` describes the product and its behavior. `CHANGELOG.md` records
user-visible changes. This file describes how the repository is worked on. A
pnpm workspace holds the app; `packages/*` is reserved for code shared between
apps and is added when a second unit needs it.

Out of scope until a proposal says otherwise: accounts, uploads, markdown
rendering, a model picker, server-side history, analytics.

## Layout

```text
apps/web/              # Astro app: pages, React islands, Canvas character, Worker entry, wrangler.jsonc
docs/                  # the README preview, a screenshot of the deployed app
scripts/               # repository helpers, run by hooks or a package
.github/workflows/     # ci.yml (the gate), deploy.yml (manual Workers release)
.github/dependabot.yml # weekly grouped dependency updates
AGENTS.md              # this file
CLAUDE.md -> AGENTS.md
LICENSE                # MIT for the code; the character art is separate (NOTICE.md)
```

`packages/` does not exist yet: `pnpm-workspace.yaml` already includes
`packages/*`, so the directory appears with the first shared package. Nothing
is kept “for later”.

`node_modules/`, `dist/`, `.wrangler/`, `.astro/`, `coverage/`,
`.env*` and `.dev.vars*` are generated or local secrets. None is committed;
the one exception is `apps/web/.dev.vars.example`, which documents the shape
without values. `.agents/` is maintainer-local working material, gitignored
and not part of the repository (see Decisions).

## Fact sources

Read a fact here before asserting it — never from memory:

| fact                                        | authoritative source |
| ------------------------------------------- | -------------------- |
| product behavior, routes, UI copy           | `apps/web/src/pages/`, `apps/web/src/components/`, `README.md` |
| chat modes, fallback, context window        | `apps/web/src/lib/chat/controller.ts` |
| LLM parameters and request limits           | `apps/web/src/lib/chat/llm.ts` |
| proxy contract and limits                   | `apps/web/src/lib/chat/proxy.ts` |
| proxy vs direct transport                   | `apps/web/src/lib/chat/transport.ts` |
| browser storage keys, limits, migration     | `apps/web/src/lib/chat/session-storage.ts`, `apps/web/src/lib/chat/settings.ts`, `apps/web/src/lib/debug/prefs.ts` |
| character poses and rendering               | `apps/web/src/lib/character/renderer.ts`, `math.ts`, `apps/web/public/character/ATTRIBUTION.md` |
| stack and dependency versions               | `package.json`, `apps/web/package.json`, `apps/web/astro.config.mjs` |
| Node version, package manager, workspace    | `.nvmrc`, `package.json`, `pnpm-workspace.yaml` |
| TypeScript strictness floor                 | `tsconfig.base.json` |
| formatting and lint rules                   | `biome.json` |
| commit message rules                        | `commitlint.config.mjs`, `lefthook.yml` |
| CI jobs and gates                           | `.github/workflows/ci.yml` |
| Worker name, routes, compatibility          | `apps/web/wrangler.jsonc` |
| deploy steps and secrets                    | `.github/workflows/deploy.yml`, `apps/web/wrangler.jsonc` |
| code license                                | `LICENSE` |
| character art license and attribution       | `NOTICE.md`, `apps/web/public/character/ATTRIBUTION.md` |
| unfinished decisions and their reasoning    | `.agents/pipelines/proposals/` (maintainer-local) |
| what is in scope, and what counts as done   | `README.md`, the proposal's `## Accept` (maintainer-local) |

When a fact changes, update the table's target in the same change. A fact page
that disagrees with the code is a bug, not a note.

## Commands

This list mirrors CI; a change is ready when all of it passes.

```bash
pnpm install --frozen-lockfile   # CI and fresh clones; drop the flag when adding a dependency
pnpm check                       # the whole gate: lint, typecheck, test, build
pnpm lint                        # biome: format, lint and import order
pnpm lint:fix                    # biome --write, then review what it changed
pnpm typecheck                   # tsc across every workspace package
pnpm test
pnpm build
pnpm dev                         # every app's dev server, on the Workers runtime
```

Root scripts recurse with `--if-present`, so a package opts into `typecheck`,
`test` and `build` by defining them. Every app must define `build` and
`deploy`; an app without `typecheck` or `test` is a gap, not a default.
`pnpm --filter @partner/web deploy` builds and deploys that one app when the
Cloudflare credentials are already on the machine.

CI runs the same commands split across parallel jobs and adds one check the root
script cannot: `commitlint` over the pushed range. Do not add a gate to CI
that `pnpm check` does not run, or the reverse — the two lists are one list.

## Git workflow

- **Conventional Commits**, enforced by the `commit-msg` hook and CI. The
  title is `<type>(<scope>): <summary>`, type from `feat`, `fix`,
  `refactor`, `perf`, `docs`, `test`, `chore`, `ci`, `build`, scope
  from `commitlint.config.mjs`, summary imperative and lower-case apart from
  acronyms (`WebGL`, `R3F`, `Workers`). Body and footers are free.
- **One logical change per commit.** A commit that needs “and” in its title is
  two commits.
- **Hooks are checkpoints, CI is the gate.** `pre-commit` formats and lints
  staged files and rejects whitespace errors; `commit-msg` checks the title;
  `pre-push` runs typecheck and tests. Bypass (`--no-verify`) only when the
  hook itself is broken, and say so in the body.
- **Work on `main` for small changes.** Use `feat/<slug>`, `fix/<slug>` or
  `chore/<slug>` for anything that spans several concerns, changes a
  decision, or needs a second look. Never rewrite history that was pushed.
- **A break is a decision.** Removing or changing a user-visible behavior,
  route, API shape or stored format gets a note under `## [Unreleased]` in
  `CHANGELOG.md`, with its migration, in the same push.
- Do not commit a failing `pnpm check`. If a check is legitimately blocked,
  fix or relax it deliberately in its own commit and record why.

## Decisions

The repository carries the record of what the product does: README, tests and
CHANGELOG. Decisions and their reasoning live in proposals under
`.agents/pipelines/` on the maintainer machine. That directory is gitignored,
a clone has none of it, and shipped files must never depend on it.

Small, single-concern work goes straight to a commit. A change to behavior,
architecture, a contract or the process starts as a proposal (`Status:
proposed`) with the options, the tradeoffs and a recommendation; the user
chooses; implement against it; flip it to `implemented` only when every
`## Accept` item is checked with evidence (a command output, a screenshot, a
URL). The workflow and class set are in `.agents/pipelines/WORKFLOW.md` and
`CLASSIFICATION.md`; the index is `.agents/pipelines/proposals/README.md`
and `node .agents/pipelines/verify-proposals.mjs` checks it after a move.

- One class per proposal, encoded by its directory and repeated in the `Class`
  header. `refactor` and `docs` are not classes.
- Acceptance is evidence, never “feels done”. `Status: proposed` means
  acceptance is not met; implementation may be in progress.
- A decision lives in its proposal, not in an ADR or a parallel design note.
- Shipped code, comments, commits and README must not cite `.agents/`, a
  proposal or a local note: state the reason inline.
- A question the code, README and open proposals do not answer starts a
  proposal before any implementation. Do not leave a half-built scaffold on
  `main`.

## Conventions

- **TypeScript strict.** `tsconfig.base.json` is the floor; a package extends
  it and adds only what its runtime needs (`lib`, `types`, `jsx`, `paths`).
  `noUncheckedIndexedAccess` is on: index a record and handle `undefined`.
- **ESM only.** `"type": "module"`, `import`/`export`, no `require`.
- **No `any` at a boundary.** Use `unknown` and narrow, or a real type.
  `@ts-expect-error` needs a reason on the same line; `@ts-ignore` is
  banned. Do not silence a Biome rule inline without a comment explaining why.
- **Comments are English and short.** State the constraint or the reason, not
  what the next line obviously does. A comment that cites a local note, ticket
  or `.agents/` path is forbidden in shipped code: the reason must be in the
  comment itself.
- **Names.** Files are kebab-case (`retry-policy.ts`); React components are
  PascalCase files exporting one component (`MessageList.tsx`); environment
  variables are SCREAMING_SNAKE_CASE. Match the surrounding code before
  introducing a new pattern.
- **Language.** Conversation with the user is Chinese. `AGENTS.md`,
  `README.md`, code, comments and commit messages are English. Working docs
  under `.agents/pipelines/` are Chinese. Match the language of the file you
  are editing.
- **Docs are product surface.** The README preview is a real screenshot of the
  deployed app in `docs/`; retake it when a UI change invalidates it. A README,
  fact table or CHANGELOG entry that disagrees with the code is a bug.
- **Secrets.** Nothing secret is committed: no token, account id, `.dev.vars`
  or `.env`. Local values go in `.dev.vars`, production values in the
  Cloudflare dashboard or GitHub secrets.
- **A dependency needs a reason.** State it in the commit body. Prefer a
  standard-library call or twenty lines over a package for one helper.

## Deploying to Cloudflare Workers

- One Worker per app: `apps/<name>/` owns its `wrangler.jsonc`, its build and
  its `deploy` script (`wrangler deploy`). Bindings (KV, D1, R2, Queues,
  Durable Objects) are declared and documented in that file.
- Local development runs the app's `dev` script — the framework's server on
  the same runtime CI deploys, not a Node approximation.
- `apps/web` builds to `dist/client` (static assets) and `dist/server`
  (the Worker). `astro build` also writes `.wrangler/deploy/config.json`,
  which points `wrangler` at `dist/server/wrangler.json`. Both are generated
  and gitignored, so a deploy needs a build in the same working tree: without
  it, `wrangler deploy` fails with “Missing entry-point”.
- A build for a named environment needs `CLOUDFLARE_ENV` set while building
  (`CLOUDFLARE_ENV=staging astro build`). Without it, `wrangler deploy --env`
  silently targets the top-level Worker, so a staging run can overwrite
  production.
- `deploy.yml` is manual (`workflow_dispatch`), checks that the app has a
  wrangler configuration, runs the gate, and then deploys. It needs the
  repository secret `CLOUDFLARE_API_TOKEN`; `CLOUDFLARE_ACCOUNT_ID` is
  optional and only needed when the token can see more than one account.
  Production deploys are deliberate actions, never a side effect of a push.
- Workflows reference actions by floating major tag (`actions/checkout@v7`,
  `pnpm/action-setup@v6`, `actions/setup-node@v7`,
  `cloudflare/wrangler-action@v4`), and Dependabot proposes updates weekly.
  The deploy action reuses the wrangler `pnpm install` puts in `apps/web`
  when no `wranglerVersion` is given.
- `apps/web` has no runtime secret: `/api/chat` forwards the endpoint and
  key the browser sends (bring your own key).
- `compatibility_date` in `wrangler.jsonc` moves forward in its own commit,
  with the reason (a binding or API it enables), not bundled into a feature.

## Always follow

- Read the fact source before asserting a fact; verify running behavior against
  the code, not against a plan or an old note.
- Keep the local proposal current in the same change that makes it stale: a
  proposal that disagrees with the code is worse than none, because it outlives
  the reasoning that produced it.
- Do not widen the gate to make a change pass: no skipped tests without a
  recorded reason, no `--no-verify` in CI, no relaxed `tsconfig` for a
  package.
- Leave the tree clean: no commented-out code, no unused exports, no scaffold
  directory kept “for later”.
