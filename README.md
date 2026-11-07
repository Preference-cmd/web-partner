# Partner

A web application deployed to Cloudflare Workers.

**Status: demo chat.** `apps/web` carries the Astro app — sidebar, full-bleed
character stage, floating chat panel and the debug drawer — plus a React chat
island that streams demo replies, keeps local history and tags each reply with
an emotion. `/api/chat`, the settings island and the character renderer are
still to come. The stack decision lives in the local proposal under
`.agents/pipelines/`, which is not part of this repository.

## Getting started

```bash
pnpm install          # installs dependencies and the git hooks
pnpm check            # the gate: lint, typecheck, test, build
```

`pnpm` 10.30.3 and Node 24 are pinned in `package.json` and `.nvmrc`.

## Repository shape

```text
apps/web     Astro app — static pages, chat island, Worker shell; one wrangler.jsonc
packages/*   code shared between apps (not created yet)
```

Proposals and their research notes are working material kept outside the
repository, under `.agents/pipelines/` on the machine that wrote them.

## Working on it

[`AGENTS.md`](AGENTS.md) is the operating manual: layout, fact sources, the
exact command list CI runs, commit and branch rules, and the conventions code
is held to. Read it before the first change.

Checks run automatically: `pre-commit` formats and lints staged files,
`commit-msg` enforces Conventional Commits, `pre-push` typechecks and tests.
CI repeats the full gate and runs commitlint over the pushed range.

## Deploying

`Deploy` (`.github/workflows/deploy.yml`) is manual and requires the
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets. It deploys `apps/web` (Worker `partner-web`) once
the secrets are set.

## License

Private — all rights reserved.
