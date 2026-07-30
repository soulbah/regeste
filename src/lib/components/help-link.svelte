<script lang="ts">
	// "What to do" beside a failure, pointing at the entry that explains it.
	//
	// One component so every failure offers the same affordance in the same
	// words. A message that names a problem and stops there is what makes people
	// give up instead of reading; this is the sentence that turns a dead end
	// into a next step.
	import { guidesHref } from '$lib/marketing-links.svelte';
	import ArrowUpRightIcon from '@lucide/svelte/icons/arrow-up-right';
	import { Button } from '$lib/components/ui/button';
	import { t } from '$lib/i18n/index.svelte';
	import { NEW_TAB } from '$lib/external-page';
	import type { HelpTopic } from '$lib/help-topics';

	let { topic, class: className = '' }: { topic: HelpTopic['id']; class?: string } = $props();
</script>

<Button
	variant="ghost"
	size="sm"
	class="text-muted-foreground hover:text-foreground h-auto gap-1 px-1.5 py-0.5 text-xs {className}"
	href={guidesHref(topic)}
	{...NEW_TAB}
>
	{t('app.whatToDo')}
	<ArrowUpRightIcon class="size-3!" />
</Button>
