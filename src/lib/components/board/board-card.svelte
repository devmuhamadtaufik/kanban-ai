<script lang="ts">
	import type { Doc } from '$convex/_generated/dataModel';
	import { Calendar, User, Flag } from '@lucide/svelte';

	interface Props {
		card: Doc<'cards'>;
		onClick: () => void;
	}

	let { card, onClick }: Props = $props();

	const priorityColors: Record<string, string> = {
		low: 'text-muted-foreground',
		medium: 'text-blue-500',
		high: 'text-orange-500',
		urgent: 'text-destructive'
	};

	const priorityLabels: Record<string, string> = {
		low: 'Low',
		medium: 'Medium',
		high: 'High',
		urgent: 'Urgent'
	};

	function formatDate(ts: number): string {
		if (!ts) return '';
		return new Date(ts).toLocaleDateString('en', { month: 'short', day: 'numeric' });
	}
</script>

<div
	class="group cursor-pointer rounded-md border bg-background p-3 shadow-sm transition-all hover:shadow-md active:cursor-grabbing"
	draggable="true"
	ondragstart={(e) => {
		e.dataTransfer?.setData('text/plain', card._id);
		e.dataTransfer?.setDragImage(e.currentTarget, 0, 0);
	}}
	onclick={onClick}
	role="button"
	tabindex="0"
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onClick();
		}
	}}
>
	<!-- Title -->
	<p class="text-sm leading-snug font-medium">{card.title}</p>

	{#if card.description}
		<p class="mt-1 line-clamp-2 text-xs text-muted-foreground">{card.description}</p>
	{/if}

	<!-- Footer: metadata -->
	<div class="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
		{#if card.storyPoints}
			<span class="inline-flex items-center gap-0.5">
				<span
					class="inline-flex size-5 items-center justify-center rounded bg-muted text-xs font-medium"
				>
					{card.storyPoints}
				</span>
			</span>
		{/if}

		{#if card.priority && card.priority !== 'medium'}
			<span class="inline-flex items-center gap-0.5 {priorityColors[card.priority]}">
				<Flag class="size-3" />
				{priorityLabels[card.priority]}
			</span>
		{/if}

		{#if card.dueDate}
			<span class="inline-flex items-center gap-0.5">
				<Calendar class="size-3" />
				{formatDate(card.dueDate)}
			</span>
		{/if}

		{#if card.assigneeId}
			<span class="inline-flex items-center gap-0.5">
				<User class="size-3" />
			</span>
		{/if}

		{#if card.labels.length > 0}
			<div class="flex gap-1">
				{#each Array.from({ length: Math.min(card.labels.length, 3) }, (_, i) => i) as i (i)}
					<span class="size-2 rounded-full bg-primary"></span>
				{/each}
				{#if card.labels.length > 3}
					<span class="text-xs">+{card.labels.length - 3}</span>
				{/if}
			</div>
		{/if}
	</div>
</div>
