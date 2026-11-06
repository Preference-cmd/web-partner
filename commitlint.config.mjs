// Conventional Commits, enforced by the `commit-msg` hook and by CI.
// https://www.conventionalcommits.org/
//
// The title is `<type>(<scope>): <summary>`; body and footers are free.
// `!` before the colon (or a `BREAKING CHANGE:` footer) marks a break.
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Scopes name the unit a change touches. `repo` is root tooling (hooks,
    // CI, workspace config); `docs` and `ci` cover those changes on their own.
    // Add a scope when a workspace package is created.
    'scope-enum': [2, 'always', ['web', 'shared', 'repo', 'docs', 'ci', 'deps']],
    // No `subject-case: lower-case` override: it cannot tell an acronym from a
    // capitalised word, so it rejects "add the R3F canvas" while accepting worse
    // prose. config-conventional still rejects sentence-case, start-case,
    // PascalCase and ALL-CAPS subjects; the imperative lower-case style is a
    // written convention in AGENTS.md.
    'header-max-length': [2, 'always', 100],
  },
};
