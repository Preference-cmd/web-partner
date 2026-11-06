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
    'subject-case': [2, 'always', 'lower-case'],
    'header-max-length': [2, 'always', 100],
  },
};
