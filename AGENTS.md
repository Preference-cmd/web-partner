# AGENTS.md — Partner

> The agent entry point for this repository. `CLAUDE.md` is a symlink to this
> file — edit here only. If `AGENTS.local.md` exists, it holds machine-local
> rules; load it after this file.

**Partner** is a web application deployed to **Cloudflare Workers**. It is a
pnpm workspace: deployable apps live in `apps/*`, shared code in `packages/*`.

The stack and the character renderer are settled in the local proposal and
approved; `apps/web` implements the shell, the canvas character, the demo chat,
the conversation list, the settings page, the debug drawer and the live proxy
against it. `Status: proposed` means the proposal is still open — build against
it until its `## Accept` items are checked with evidence, then flip to
`implemented`. The workflow below is stack-neutral.

Proposals and their research live under `.agents/pipelines/` and are **not part
of this repository**: a fresh clone has none of it. This file, `README.md` and
`CHANGELOG.md` are the only documents a clone carries, so they must stand
alone. A proposal is the only place a decision is recorded — there are no ADRs,
design docs or decision logs.

## Layout

```text
apps/web/              # Astro app: static pages, React islands on shadcn/ui + AI Elements, Canvas 2D character, Worker entry
packages/              # shared code: types, clients, UI kit (not created yet)
scripts/               # repo helpers run by hooks, CI or a package
.github/workflows/     # ci.yml (the gate), deploy.yml (manual Workers release)
.github/dependabot.yml # weekly grouped dependency updates
AGENTS.md              # this file
CLAUDE.md -> AGENTS.md
LICENSE                # MIT for the code; the character art is separate (NOTICE.md)
```

`node_modules/`, `dist/`, `.wrangler/`, `.astro/`, `coverage/`, `.env*` and
`.dev.vars*` are build output or local secrets. None of them are committed; the
one exception is `apps/web/.dev.vars.example`, which documents the shape without
values. `.agents/` sits outside the repository by design (see Proposals below).

## Fact sources

Read a fact here before asserting it — never from memory:

| fact                                          | authoritative source                              |
| --------------------------------------------- | ------------------------------------------------- |
| stack, rendering route, test runner           | the current proposal, `## Decision` (local)        |
| character renderer boundary                   | the current proposal, `## Decision` (local)        |
| Node version, package manager, root scripts   | `package.json`, `.nvmrc`                          |
| workspace membership                          | `pnpm-workspace.yaml`                             |
| TypeScript strictness floor                   | `tsconfig.base.json`                              |
| formatting and lint rules                     | `biome.json`                                      |
| commit message rules                          | `commitlint.config.mjs`, `lefthook.yml`           |
| CI jobs and gates                             | `.github/workflows/ci.yml`                        |
| Worker name, routes, bindings, compatibility  | `apps/*/wrangler.jsonc`                           |
| deploy steps and secrets                      | `.github/workflows/deploy.yml`, `apps/*/wrangler.jsonc` |
| browser storage keys, limits and migration    | `apps/web/src/lib/chat/session-storage.ts`, `apps/web/src/lib/chat/settings.ts`, `apps/web/src/lib/debug/prefs.ts` |
| chat proxy limits and validation              | `apps/web/src/lib/chat/proxy.ts`                  |
| code license                                  | `LICENSE`                                         |
| character art license                         | `NOTICE.md`, `apps/web/public/character/ATTRIBUTION.md` |
| unfinished decisions and their reasoning      | `.agents/pipelines/proposals/` (local)            |
| what is in scope, and what counts as done     | `.agents/pipelines/proposals/` (local)            |

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
pnpm dev                         # every app's dev server
```

Root scripts recurse with `--if-present`, so a package opts into `typecheck`,
`test` and `build` by defining them. Every app must define `build` and
`deploy`; an app without `typecheck` or `test` is a gap, not a default.

CI runs the same commands split across parallel jobs and adds one check the
root script cannot: `commitlint` over the pushed range. Do not add a gate to
CI that `pnpm check` does not run, or the reverse — the two lists are one list.

## Git workflow

- **Conventional Commits**, enforced by the `commit-msg` hook and CI. The
  title is `<type>(<scope>): <summary>`, type from `feat`, `fix`, `refactor`,
  `perf`, `docs`, `test`, `chore`, `ci`, `build`, scope from
  `commitlint.config.mjs`, summary imperative and lower-case apart from
  acronyms (`WebGL`, `R3F`, `Workers`). Body and footers are free.
- **One logical change per commit.** A commit that needs "and" in its title is
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

## Proposals

Small, single-concern work goes straight to a commit (**Direct**). Anything
that changes behavior, architecture, a contract or the process needs a proposal
first (**Noted**). The workflow, template, class set and lifecycle are defined
in `.agents/pipelines/WORKFLOW.md`; the class table is in
`.agents/pipelines/CLASSIFICATION.md`.

- One class per proposal, encoded by its directory and repeated in the `Class`
  header. `refactor` and `docs` are not classes.
- The proposal owns goal, decision, acceptance criteria and evidence.
  `Status: proposed` means acceptance is not met yet; implementation may be in
  progress.
- A decision is recorded in the proposal, nowhere else — there are no ADRs or
  parallel design documents.
- Because `.agents/` is local-only, a proposal cannot be linked from shipped
  code or commits: state the reason inline.
- An acceptance item is checked with evidence (a screenshot, a recording, a
  command output, a URL), never because the work "feels done".
- `.agents/pipelines/proposals/README.md` is the single index of active
  proposals and their acceptance progress. Update it whenever a proposal is
  added, moved, restated or changes status.
- After moving, renaming or restating a proposal, run
  `node .agents/pipelines/verify-proposals.mjs`.

## Conventions

- **TypeScript strict.** `tsconfig.base.json` is the floor; a package extends
  it and adds only what its runtime needs (`lib`, `types`, `jsx`, `paths`).
  `noUncheckedIndexedAccess` is on: index a record and handle `undefined`.
- **ESM only.** `"type": "module"`, `import`/`export`, no `require`.
- **No `any` at a boundary.** Use `unknown` and narrow, or a real type.
  `@ts-expect-error` needs a reason on the same line; `@ts-ignore` is banned.
  Do not silence a Biome rule inline without a comment explaining why.
- **Comments are English and short.** State the constraint or the reason,
  not what the next line obviously does. Comments that cite a local note,
  ticket or `.agents/` path are forbidden in shipped code: the reason must be
  in the comment itself.
- **Names.** Files are kebab-case (`retry-policy.ts`); React components are
  PascalCase files exporting one component (`MessageList.tsx`); environment
  variables are SCREAMING_SNAKE_CASE. Match the surrounding code before
  introducing a new pattern.
- **Language.** Conversation with the user is Chinese. `AGENTS.md`,
  `README.md`, code, comments and commit messages are English. Working docs under
  `.agents/pipelines/` are Chinese. Match the language of the file you are editing.
- **Secrets.** Nothing secret is committed: no token, account id, `.dev.vars`
  or `.env`. Local values go in `.dev.vars`, production values in the
  Cloudflare dashboard or GitHub secrets.
- **A dependency needs a reason.** State it in the commit body. Prefer a
  standard-library call or twenty lines over a package for one helper.

## Deploying to Cloudflare Workers

- One Worker per app: `apps/<name>/` owns its `wrangler.jsonc`, its build and
  its `deploy` script (`wrangler deploy`). Bindings (KV, D1, R2, Queues,
  Durable Objects) are declared and documented in that file.
- Local development runs the app's `dev` script, which is `wrangler dev`
  (or the framework's dev server with the Cloudflare plugin) — the same
  runtime CI deploys, not a Node approximation.
- `apps/web` builds to `dist/client` (static assets) and `dist/server` (the
  Worker), and `astro build` also writes `.wrangler/deploy/config.json`, which
  points `wrangler` at `dist/server/wrangler.json`. Both are generated and
  gitignored, so a deploy needs a build in the same working tree: without it,
  `wrangler deploy` fails with "Missing entry-point".
- A build for a named environment needs `CLOUDFLARE_ENV` set while building
  (`CLOUDFLARE_ENV=staging astro build`). Without it, `wrangler deploy --env`
  silently targets the top-level Worker, so a staging run can overwrite
  production.
- `deploy.yml` is manual (`workflow_dispatch`), checks that the app has a
  wrangler configuration, and then deploys. It needs the repository secret
  `CLOUDFLARE_API_TOKEN`; `CLOUDFLARE_ACCOUNT_ID` is optional and only needed
  when the token can see more than one account. Production deploys are
  deliberate actions, never a side effect of a push.
- Workflows reference actions by floating major tag (`actions/checkout@v7`,
  `pnpm/action-setup@v6`, `actions/setup-node@v7`,
  `cloudflare/wrangler-action@v4`), and Dependabot proposes updates weekly. The
  deploy action reuses the wrangler `pnpm install` puts in `apps/web` when no
  `wranglerVersion` is given.
- `apps/web` has no runtime secret: `/api/chat` forwards the endpoint and key
  the browser sends (bring your own key).
- `compatibility_date` in `wrangler.jsonc` moves forward in its own commit,
  with the reason (a binding or API it enables), not bundled into a feature.

## When something is undecided

Read `.agents/pipelines/proposals/` for the current decision and
`.agents/pipelines/research/` for the evidence behind it. If the answer is not
there:

1. Take the **Noted** track: register a proposal under
   `.agents/pipelines/proposals/<class>/YYYY-MM-DD-<slug>.md` with
   `Status: proposed`, the options, the tradeoffs and a recommendation.
2. Ask the user to choose. Once they approve, implement against the proposal;
   do not leave a half-built scaffold behind as a "prototype" on `main`.
3. When its `## Accept` items are met, set `Status: implemented` and fix the
   fact-source table above in the same change.

## Always follow

- Read the fact source before asserting a fact; verify running behavior
  against the code, not against a plan or an old note.
- Keep the local proposal current in the same change that makes it stale: a
  proposal that disagrees with the code is worse than none, because it
  outlives the reasoning that produced it.
- Do not widen the gate to make a change pass: no skipped tests without an
  issue link, no `--no-verify` in CI, no relaxed `tsconfig` for a package.
- Leave the tree clean: no commented-out code, no unused exports, no
  scaffold directory kept "for later".
