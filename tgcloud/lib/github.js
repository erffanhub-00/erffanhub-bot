// GitHub projects: live fetch from the public API (no token needed
// for public repos), cached in SQLite so the screen still works when
// GitHub is unreachable. Never fails the bot — a failed fetch falls
// back to the cache, and an empty cache shows an empty list.

import { fetch } from 'sdk';
import { GITHUB_USER } from './config.js';
import { parseGitHubRepos } from './pure.js';
import { getGithubCache, setGithubCache } from './store.js';

// Fetch the repo list with an injectable fetch (stubbed in tests).
// Returns { ok: true, repos } or { ok: false, error }.
export async function fetchRepos(fetchImpl) {
  const doFetch = fetchImpl || fetch;
  try {
    const res = await doFetch(
      `https://api.github.com/users/${GITHUB_USER}/repos?per_page=100&sort=updated`,
      { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'erffanhub-files-bot' } },
    );
    if (!res.ok) return { ok: false, error: `GitHub با خطای ${res.status} جواب داد.` };
    const json = await res.json();
    return { ok: true, repos: parseGitHubRepos(json) };
  } catch (err) {
    return { ok: false, error: 'اتصال به گیت‌هاب ممکن نشد.' };
  }
}

// Get the projects: live first, cache on success, cache on failure.
// Returns { repos, cachedAt, liveFailed }.
export async function getProjects(forceRefresh) {
  const cache = await getGithubCache();
  const live = await fetchRepos();
  if (live.ok) {
    await setGithubCache(JSON.stringify(live.repos));
    return { repos: live.repos, cachedAt: Date.now(), liveFailed: false };
  }
  if (cache?.body) {
    let repos = [];
    try {
      repos = JSON.parse(cache.body);
    } catch {
      repos = [];
    }
    return { repos, cachedAt: cache.fetched_at || null, liveFailed: true };
  }
  return { repos: [], cachedAt: null, liveFailed: true };
}
