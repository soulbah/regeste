// Scroll choreography for the landing, on Motion's vanilla API.
//
// One grammar: a block reveals once when it enters the viewport, rising the
// way the hero does on load. Nothing loops, nothing replays.

import { animate } from 'motion';

/** One-shot visibility trigger on a plain IntersectionObserver: fires the
 * callback the first time `amount` of the node is visible, then disconnects.
 * (motion's inView proved fragile across HMR re-mounts; this is the same
 * contract with no state kept outside the observer.) */
function onceInView(node: Element, amount: number, fire: () => void): () => void {
	const io = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (entry.intersectionRatio >= amount || entry.isIntersecting) {
					io.disconnect();
					fire();
					return;
				}
			}
		},
		{ threshold: Math.min(amount, 1) }
	);
	io.observe(node);
	return () => io.disconnect();
}

const EASE = [0.16, 1, 0.3, 1] as const;

function reduced(): boolean {
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Rise-in once, when a quarter of the block is visible. */
export function reveal(node: HTMLElement, opts: { delay?: number } = {}) {
	if (reduced()) return;
	node.style.opacity = '0';
	node.style.transform = 'translateY(16px)';
	const stop = onceInView(node, 0.25, () => {
		animate(
			node,
			{ opacity: 1, transform: 'translateY(0px)' },
			{ duration: 0.6, delay: opts.delay ?? 0, ease: EASE }
		);
	});
	return { destroy: stop };
}
