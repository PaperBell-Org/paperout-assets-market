// Version helpers. A leaf asset's version is the tag that last released a change to
// it (best effort); recipes/bundles carry a curated semver in their manifest.

import { execFileSync } from 'node:child_process';

const SEMVER = /^\d+\.\d+\.\d+(?:[-+].*)?$/;

export function normalizeSemver(tag, fallback = '0.0.0') {
  const t = String(tag || '').replace(/^v/, '').trim();
  return SEMVER.test(t) ? t : fallback;
}

export function isSemver(v) {
  return SEMVER.test(String(v || '').replace(/^v/, '').trim());
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

/**
 * Best-effort version of a single file: the earliest release tag that contains the
 * commit which last modified it; falls back to the current release tag.
 */
export function fileVersion(relPath, fallbackTag) {
  try {
    const commit = git(['log', '-1', '--format=%H', '--', relPath]);
    if (commit) {
      const tags = git(['tag', '--contains', commit, '--sort=version:refname'])
        .split('\n')
        .map((t) => t.trim())
        .filter(Boolean);
      if (tags.length) return normalizeSemver(tags[0], normalizeSemver(fallbackTag));
    }
  } catch {
    /* not a git repo / no tags yet — fall through */
  }
  return normalizeSemver(fallbackTag);
}
