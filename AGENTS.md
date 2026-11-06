# AGENTS.md — Partner

> The agent entry point for this repository. `CLAUDE.md` is a symlink to this
> file — edit here only. If `AGENTS.local.md` exists, it holds machine-local
> rules; load it after this file.

**Partner** is a web application deployed to **Cloudflare Workers**. It is a
pnpm workspace: deployable apps live in `apps/*`, shared code in `packages/*`.

The frontend stack is **not chosen yet** — it is an open decision recorded in
[`docs/adr/0001-stack.md`](docs/adr/0001-stack.md). Until that ADR is
accepted, do not add a framework dependency, scaffold `apps/web`, or assume a
rendering model. The workflow below is stack-neutral and already works.

## Layout

```text
apps/                  # deployable Workers apps; one wrangler.jsonc each (not created yet)
packages/              # shared code: types, clients, UI kit (not created yet)
docs/                  # durable facts about this repo — enter at docs/README.md
docs/adr/              # Architecture Decision Records, one file per decision
scripts/               # repo helpers run by hooks, CI or a package
.github/workflows/     # ci.yml (the gate), deploy.yml (manual Workers release)
.github/dependabot.yml # weekly grouped dependency updates
AGENTS.md              # this file
CLAUDE.md -> AGENTS.md
```

`node_modules/`, `dist/`, `.wrangler/`, `coverage/` and `.dev.vars*` are build
output or local secrets. None of them are committed.

## Fact sources

Read a fact here before asserting it — never from memory:

| fact                                          | authoritative source                              |
| --------------------------------------------- | ------------------------------------------------- |
| stack, rendering model, test runner           | `docs/adr/0001-stack.md` (open)                   |
| Node version, package manager, root scripts   | `package.json`, `.nvmrc`                          |
| workspace membership                          | `pnpm-workspace.yaml`                             |
| TypeScript strictness floor                   | `tsconfig.base.json`                              |
| formatting and lint rules                     | `biome.json`                                      |
| commit message rules                          | `commitlint.config.mjs`, `lefthook.yml`           |
| CI jobs and gates                             | `.github/workflows/ci.yml`                        |
| Worker name, routes, bindings, compatibility  | `apps/*/wrangler.jsonc`                           |
| deploy steps and secrets                      | `.github/workflows/deploy.yml`, `docs/deployment.md` (created with the first app) |
| unfinished decisions and their reasoning      | `docs/adr/`                                       |

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
  `commitlint.config.mjs`, summary lower-case and imperative. Body and
  footers are free.
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
  `README.md`, code, comments and commit messages are English. `docs/` is
  Chinese. Match the language of the file you are editing.
- **Secrets.** Nothing secret is committed: no token, account id, `.dev.vars`
  or `.env`. Local values go in `.dev.vars`, production values in the
  Cloudflare dashboard or GitHub secrets.
- **A dependency needs a reason.** State it in the commit body. Prefer a
  standard-library call or twenty lines over a package for one helper.

## Deploying to Cloudflare Workers

- One Worker per app: `apps/<name>/` owns its `wrangler.jsonc`, its build and
  its `deploy` script (`wrangler deploy`). Bindings (KV, D1, R2, Queues,
  Durable Objects) are declared there and documented in `docs/deployment.md`.
- Local development runs the app's `dev` script, which is `wrangler dev`
  (or the framework's dev server with the Cloudflare plugin) — the same
  runtime CI deploys, not a Node approximation.
- `deploy.yml` is manual (`workflow_dispatch`) and refuses to run until the
  app's `wrangler.jsonc` exists. It needs repository secrets
  `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Production deploys are
  deliberate actions, never a side effect of a push.
- `compatibility_date` in `wrangler.jsonc` moves forward in its own commit,
  with the reason (a binding or API it enables), not bundled into a feature.

## When a decision is still open

The stack is the first open decision; more will follow (rendering model, data
store, auth, where the API lives). For any of them:

1. Read `docs/adr/` first — the answer may already be recorded.
2. If it is not, write the ADR in `docs/adr/NNNN-<slug>.md` with
   `Status: proposed`, the options, the tradeoffs and a recommendation.
3. Ask the user to choose. Do not implement the choice before it is accepted,
   and do not leave a half-built scaffold behind as a "prototype" on `main`.
4. When accepted, set `Status: accepted` and update the fact-source table
   above in the same change.

## Always follow

- Read the fact source before asserting a fact; verify running behavior
  against the code, not against a plan or an old note.
- Keep `docs/` current in the same change that makes it stale.
- Do not widen the gate to make a change pass: no skipped tests without an
  issue link, no `--no-verify` in CI, no relaxed `tsconfig` for a package.
- Leave the tree clean: no commented-out code, no unused exports, no
  scaffold directory kept "for later".
