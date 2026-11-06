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

### Notes

- No application code exists yet; the stack decision is the next step.
