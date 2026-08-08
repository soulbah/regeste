/** Swipe-to-dismiss for the mobile drawer.
 *
 * bits-ui's Dialog ships no gesture, so the drawer could only be closed by
 * aiming at the header button or at the strip of overlay beside it — measured at
 * 97px on a 390px screen, against a 288px drawer. Both are deliberate aims with
 * a thumb that just opened the thing with one flick.
 *
 * The listener stays out of the way until it knows the gesture is horizontal,
 * because the drawer's chat list scrolls vertically and claiming the touch on
 * the first move would fight it. The axis is decided once, on the first move
 * that clears a few pixels, and never revisited for that gesture — mid-gesture
 * axis changes are how drawers end up feeling like they steal scrolls.
 *
 * Registered by hand rather than with `ontouchmove`, because the drawer follows
 * the finger only if the move can be preventDefault'ed, and Svelte registers
 * touchmove as passive.
 */
export type SwipeDismissOptions = {
	/** Which edge the drawer is anchored to; the closing direction follows it. */
	side: 'left' | 'right';
	onDismiss: () => void;
};

/** Past this fraction of the drawer's width, letting go closes it. */
const DISTANCE_RATIO = 0.4;
/** …or past this speed, so a short flick closes it too (px/ms). */
const VELOCITY = 0.5;
/** Movement below this is not yet a direction, just a thumb settling. */
const AXIS_THRESHOLD = 8;

export function swipeDismiss(node: HTMLElement, options: SwipeDismissOptions) {
	let opts = options;
	let startX = 0;
	let startY = 0;
	let startTime = 0;
	let axis: 'x' | 'y' | null = null;
	let offset = 0;

	const closingSign = () => (opts.side === 'left' ? -1 : 1);

	function paint(px: number) {
		node.style.transform = px === 0 ? '' : `translate3d(${px}px, 0, 0)`;
	}

	function release(animate: boolean) {
		node.style.transition = animate ? 'transform 150ms ease-out' : '';
		paint(0);
		if (animate) {
			const clear = () => {
				node.style.transition = '';
				node.removeEventListener('transitionend', clear);
			};
			node.addEventListener('transitionend', clear);
		}
		offset = 0;
		axis = null;
	}

	function onTouchStart(event: TouchEvent) {
		if (event.touches.length !== 1) return;
		const touch = event.touches[0];
		startX = touch.clientX;
		startY = touch.clientY;
		startTime = event.timeStamp;
		axis = null;
		offset = 0;
		node.style.transition = '';
	}

	function onTouchMove(event: TouchEvent) {
		if (event.touches.length !== 1) return;
		const touch = event.touches[0];
		const dx = touch.clientX - startX;
		const dy = touch.clientY - startY;

		if (axis === null) {
			if (Math.abs(dx) < AXIS_THRESHOLD && Math.abs(dy) < AXIS_THRESHOLD) return;
			axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
		}
		if (axis === 'y') return;

		// Only the closing direction moves. Dragging the other way would tear the
		// drawer off its edge, which no drawer on either mobile OS does.
		offset = closingSign() < 0 ? Math.min(0, dx) : Math.max(0, dx);
		if (offset !== 0 && event.cancelable) event.preventDefault();
		paint(offset);
	}

	function onTouchEnd(event: TouchEvent) {
		if (axis !== 'x') {
			release(false);
			return;
		}
		const travelled = Math.abs(offset);
		const elapsed = Math.max(1, event.timeStamp - startTime);
		const far = travelled > node.offsetWidth * DISTANCE_RATIO;
		const fast = travelled / elapsed > VELOCITY && travelled > AXIS_THRESHOLD * 2;
		if (far || fast) {
			// Hand the drawer back at rest so the library's own exit animation runs
			// from the edge instead of from wherever the finger stopped.
			node.style.transition = '';
			paint(0);
			offset = 0;
			axis = null;
			opts.onDismiss();
			return;
		}
		release(true);
	}

	node.addEventListener('touchstart', onTouchStart, { passive: true });
	node.addEventListener('touchmove', onTouchMove, { passive: false });
	node.addEventListener('touchend', onTouchEnd, { passive: true });
	node.addEventListener('touchcancel', () => release(true), { passive: true });

	return {
		update(next: SwipeDismissOptions) {
			opts = next;
		},
		destroy() {
			node.removeEventListener('touchstart', onTouchStart);
			node.removeEventListener('touchmove', onTouchMove);
			node.removeEventListener('touchend', onTouchEnd);
		}
	};
}
