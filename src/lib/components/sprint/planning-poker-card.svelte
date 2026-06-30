<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import type { Doc, Id } from '$convex/_generated/dataModel';

	interface Props {
		card: Doc<'cards'>;
		onVote?: (cardId: Id<'cards'>, points: number) => void;
	}

	let { card, onVote }: Props = $props();

	const options = [1, 2, 3, 5, 8, 13];
	let selected = $state(card.storyPoints ?? null);

	function vote(points: number) {
		selected = points;
		onVote?.(card._id, points);
	}
</script>

<div class="rounded-lg border bg-card p-4 shadow-sm">
	<h4 class="font-medium">{card.title}</h4>
	{#if card.description}
		<p class="mt-1 line-clamp-2 text-xs text-muted-foreground">{card.description}</p>
	{/if}

	<div class="mt-3 flex flex-wrap gap-2">
		{#each options as points (points)}
			<Button
				variant={selected === points ? 'default' : 'outline'}
				size="sm"
				class="h-8 w-10"
				onclick={() => vote(points)}
			>
				{points}
			</Button>
		{/each}
	</div>
</div>
