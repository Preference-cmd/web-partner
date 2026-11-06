// Installs the lefthook git hooks. Runs from the root `prepare` script, so a
// fresh `pnpm install` is enough to get hooks. CI and a checkout without
// `.git` (a release tarball) skip quietly instead of doing pointless work.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

if (process.env.CI || !existsSync('.git')) {
  process.exit(0);
}

try {
  execFileSync('lefthook', ['install'], { stdio: 'inherit' });
} catch {
  console.warn('lefthook is not installed; run `pnpm exec lefthook install` once it is.');
}
