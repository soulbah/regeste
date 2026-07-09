<script lang="ts">
	// T4 (spec 009): static per-mode data-flow explainer, à la Brave Leo.
	// Plain claims a reader can verify against the open source.
	const modes = [
		{
			name: 'Private',
			dot: 'bg-mode-private',
			leaves: 'Nothing. The model runs in your browser (one-time download).',
			stays: 'Documents, index, chats, the AI model, your questions and answers.',
			server: 'Never contacted for answering. No account needed.'
		},
		{
			name: 'Assisted',
			dot: 'bg-mode-assisted',
			leaves:
				'Your question plus only the excerpts you approved in the review step — never full documents, never file names.',
			stays: 'Documents, index, chats. The excerpts you exclude.',
			server:
				'Relays the excerpts to the AI and streams the answer back. Stores your email, plan and a usage counter. Never stores or logs content.'
		},
		{
			name: 'My AI',
			dot: 'bg-mode-myai',
			leaves:
				'Your question plus the relevant excerpts, sent straight to the endpoint you configured.',
			stays: 'Documents, index, chats.',
			server: "Folio's servers are not involved at all — traffic goes browser → your endpoint."
		}
	];
</script>

<svelte:head><title>How your data flows · Folio</title></svelte:head>

<div class="flex h-svh flex-col">
	<header class="flex items-center justify-between border-b px-6 py-3">
		<div>
			<h1 class="font-display text-lg tracking-tight">How your data flows</h1>
			<p class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
				Per mode · verifiable in the source
			</p>
		</div>
	</header>

	<div class="flex-1 overflow-y-auto">
		<div class="mx-auto max-w-3xl space-y-6 px-6 py-8">
			<p class="text-muted-foreground max-w-xl text-sm">
				Folio parses, indexes and searches your documents entirely in this browser. The only
				difference between modes is who generates the answer — and therefore what has to leave.
			</p>
			<div class="grid gap-4 md:grid-cols-3">
				{#each modes as mode (mode.name)}
					<div class="space-y-3 rounded-xl border p-4">
						<p class="flex items-center gap-2 font-medium">
							<span class="size-2 rounded-full {mode.dot}"></span>
							{mode.name}
						</p>
						<div>
							<p class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
								What leaves
							</p>
							<p class="mt-1 text-sm leading-relaxed">{mode.leaves}</p>
						</div>
						<div>
							<p class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
								What stays
							</p>
							<p class="mt-1 text-sm leading-relaxed">{mode.stays}</p>
						</div>
						<div>
							<p class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
								The server
							</p>
							<p class="mt-1 text-sm leading-relaxed">{mode.server}</p>
						</div>
					</div>
				{/each}
			</div>
			<p class="text-muted-foreground text-xs">
				Don't trust us: the code is open source — inspect it, self-host it, or stay in Private mode
				with the network cable unplugged.
			</p>
		</div>
	</div>
</div>
