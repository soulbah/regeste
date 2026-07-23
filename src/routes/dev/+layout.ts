import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

// The /dev/* harness pages exercise the pipeline with dev-only affordances.
// They must never be reachable on a deployed origin.
export function load(): void {
	if (!dev) error(404, 'Not found');
}
