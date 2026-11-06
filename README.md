# Partner

A web application deployed to Cloudflare Workers.

**Status: workflow only.** The repository defines how work is done; the
application itself has not been scaffolded, because the stack decision is
still open — see [docs/adr/0001-stack.md](docs/adr/0001-stack.md).

## Getting started

```bash
pnpm install          # installs dependencies and the git hooks
pnpm check            # the gate: lint, typecheck, test, build
```

`pnpm` 10.30.3 and Node 24 are pinned in `package.json` and `.nvmrc`.

## Repository shape

```text
apps/*       deployable Workers applications — one wrangler.jsonc each
packages/*   code shared between apps
docs/        durable facts, and ADRs for decisions
```

## Working on it

[`AGENTS.md`](AGENTS.md) is the operating manual: layout, fact sources, the
exact command list CI runs, commit and branch rules, and the conventions code
is held to. Read it before the first change.

Checks run automatically: `pre-commit` formats and lints staged files,
`commit-msg` enforces Conventional Commits, `pre-push` typechecks and tests.
CI repeats the full gate and runs commitlint over the pushed range.

## Deploying

`Deploy` (`.github/workflows/deploy.yml`) is manual and requires the
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets. It
refuses to run until an app exists under `apps/`.

## License

Private — all rights reserved.
