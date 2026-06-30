<script lang="ts">
	import type { Doc, Id } from '$convex/_generated/dataModel';

	interface Props {
		card: Doc<'cards'>;
		labels?: Doc<'labels'>[];
		showSprintInfo?: boolean;
		onClick?: () => void;
		onAddToSprint?: (cardId: Id<'cards'>) => void;
	}

	let { card, labels = [], showSprintInfo = false, onClick, onAddToSprint }: Props = $props();

	const priorityColors: Record<string, string> = {
		low: 'text-muted-foreground',
		medium: 'text-blue-500',
		high: 'text-orange-500',
		urgent: 'text-destructive'
	};

	function formatDate(ts: number): string {
		if (!ts) return '';
		return new Date(ts).toLocaleDateString('en', { month: 'short', day: 'numeric' });
	}

	const cardLabels = $derived(labels.filter((l) => card.labels.includes(l._id)));
</script>

<div
	class="group cursor-pointer rounded-md border bg-background p-3 shadow-sm transition-all hover:shadow-md"
	draggable="true"
	role="button"
	tabindex="0"
	onclick={() => onClick?.()}
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onClick?.();
		}
	}}
>
	<p class="text-sm leading-snug font-medium">{card.title}</p>

	{#if card.description}
		<p class="mt-1 line-clamp-2 text-xs text-muted-foreground">{card.description}</p>
	{/if}

	<div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
		{#if card.storyPoints}
			<span
				class="inline-flex size-5 items-center justify-center rounded bg-muted text-xs font-medium"
			>
				{card.storyPoints}
			</span>
		{/if}

		{#if card.priority !== 'medium'}
			<span class="inline-flex items-center gap-0.5 {priorityColors[card.priority]}">
				{card.priority}
			</span>
		{/if}

		{#if card.dueDate}
			<span class="inline-flex items-center gap-0.5">
				{formatDate(card.dueDate)}
			</span>
		{/if}

		{#if showSprintInfo && card.sprintId}
			<span
				class="inline-flex items-center rounded bg-secondary px-1.5 py-0.5 text-secondary-foreground"
			>
				In sprint
			</span>
		{/if}

		{#if cardLabels.length > 0}
			<div class="flex gap-1">
				{#each cardLabels as label (label._id)}
					<span
						class="inline-flex items-center rounded px-1.5 py-0.5 text-xs"
						style="background-color: {label.color}; color: #fff;"
					>
						{label.name}
					</span>
				{/each}
			</div>
		{/if}
	</div>

	{#if onAddToSprint && !card.sprintId}
		<button
			class="mt-2 w-full rounded border border-dashed py-1 text-xs text-muted-foreground hover:bg-secondary"
			onclick={(e) => {
				e.stopPropagation();
				onAddToSprint(card._id);
			}}
		>
			+ Add to sprint
		</button>
	{/if}
</div>
