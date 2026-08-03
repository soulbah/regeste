import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import BackgroundWork from './background-work.svelte';
import { llmStore, type PrivateStatus } from '$lib/private-ai/llm.svelte';

const initial = {
	status: llmStore.status,
	progress: llmStore.progress
};

afterEach(() => {
	llmStore.status = initial.status as PrivateStatus;
	llmStore.progress = initial.progress;
});

function render() {
	const host = document.createElement('div');
	document.body.appendChild(host);
	const app = mount(BackgroundWork, { target: host });
	flushSync();
	return {
		host,
		stop: () => {
			unmount(app);
			host.remove();
		}
	};
}

describe('background model work', () => {
	it('uses moving startup state instead of a frozen 0% bar', () => {
		llmStore.status = 'downloading';
		llmStore.progress = 0;
		const { host, stop } = render();

		expect(host.textContent).toContain('Starting the download');
		expect(host.textContent).not.toContain('0%');
		expect(host.querySelector('.model-loading-indicator')).not.toBeNull();

		llmStore.progress = 0.05;
		flushSync();
		expect(host.textContent).toContain('Downloading the model');
		expect(host.textContent).toContain('5%');
		stop();
	});
});
