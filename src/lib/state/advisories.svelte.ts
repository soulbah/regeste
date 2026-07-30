// One place for "something about this session is worth knowing".
//
// The problem this solves is proliferation. Each condition worth surfacing — a
// waiting update, a slow fallback, storage that will not be kept — arrived with
// its own banner in its own corner, and three of those turn a sober app into a
// noticeboard. So: one slot, one grammar, one at a time.
//
// The rules that keep it honest:
//
// Ranked, and only the top one shows. Two advisories at once means the second is
// read as decoration; if a session really has two problems, the worse one is the
// one that changes what you do.
//
// Dismissible per session, not forever. A condition that is still true tomorrow
// deserves to be said again tomorrow, and a permanent dismissal is how a real
// warning becomes invisible for good.
//
// It says the consequence, never the mechanism. "Search is slower on this
// browser" is actionable; "vec0 knn declined" is a log line.

import { SvelteSet } from 'svelte/reactivity';

/** Higher wins. Deliberately coarse: a scale with ten steps invites arguing about
 * step seven instead of deciding whether a thing is worth saying at all. */
export type AdvisoryLevel = 'notice' | 'degraded' | 'blocked';

export const LEVEL_RANK: Record<AdvisoryLevel, number> = {
	notice: 1,
	degraded: 2,
	blocked: 3
};

export interface Advisory {
	/** Stable, because dismissal is remembered by it. */
	id: string;
	level: AdvisoryLevel;
	/** One line, already translated. The consequence, not the cause. */
	text: string;
	/** The single thing to do about it, if there is one. */
	action?: { label: string; run: () => void };
	/** A guide id when the explanation does not fit on one line. */
	topic?: string;
}

class AdvisoryStore {
	private dismissed = new SvelteSet<string>();

	/** Registered by whoever owns the condition, so this store knows no domain. */
	sources = $state<(() => Advisory | null)[]>([]);

	register(source: () => Advisory | null): void {
		this.sources.push(source);
	}

	/** The one to show, or nothing. */
	get current(): Advisory | null {
		const live = this.sources
			.map((read) => read())
			.filter((a): a is Advisory => a !== null && !this.dismissed.has(a.id));
		if (!live.length) return null;
		return live.reduce((worst, a) => (LEVEL_RANK[a.level] > LEVEL_RANK[worst.level] ? a : worst));
	}

	dismiss(id: string): void {
		this.dismissed.add(id);
	}
}

export const advisories = new AdvisoryStore();
