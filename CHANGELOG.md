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
  persists in this browser (`partner.chat.v1`, 100 messages). Each reply is
  labelled `demo`, `model` or `fallback`; the live path falls back to a
  template until `/api/chat` exists.
- Client-side navigation between `/` and `/settings` (`ClientRouter`), so a
  running reply survives the page change; a full reload marks it interrupted.

### Notes

- `/api/chat` does not exist yet, so live mode currently ends in a template
  fallback; the character renderer and the settings island are still to come.
