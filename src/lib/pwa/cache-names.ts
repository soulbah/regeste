// The shell cache name lives here so the service worker, the models list and the
// panic wipe all agree on it. Versioned by the SvelteKit build `version`, so a
// deploy starts a fresh cache and the old one is dropped on activate.

const SHELL_CACHE_PREFIX = 'regeste-shell-';

export function shellCacheName(version: string): string {
	return `${SHELL_CACHE_PREFIX}${version}`;
}

/** True for a cache this app owns as its app shell (never a model cache). */
export function isShellCache(name: string): boolean {
	return name.startsWith(SHELL_CACHE_PREFIX);
}
