<script lang="ts">
	import type { Doc } from '$convex/_generated/dataModel';
	import { formatDate } from '$lib/utils.js';

	interface Props {
		sprint: Doc<'sprints'>;
		totalPoints: number;
		completedPoints: number;
		remainingCards: number;
	}

	let { sprint, totalPoints, completedPoints, remainingCards }: Props = $props();

	let progress = $derived(totalPoints > 0 ? Math.round((completedPoints / totalPoints) * 100) : 0);
	let statusColor = $derived(
		sprint.status === 'active'
			? 'bg-blue-500'
			: sprint.status === 'completed'
				? 'bg-green-500'
				: 'bg-muted-foreground'
	);
</script>

<div class="rounded-lg border bg-card p-4 shadow-sm">
	<div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
		<div>
			<div class="flex items-center gap-2">
				<h2 class="text-lg font-semibold">{sprint.name}</h2>
				<span class="rounded px-2 py-0.5 text-xs font-medium text-white {statusColor}">
					{sprint.status}
				</span>
			</div>
			{#if sprint.goal}
				<p class="mt-1 text-sm text-muted-foreground">{sprint.goal}</p>
			{/if}
		</div>
		<div class="text-right text-sm text-muted-foreground">
			<div>{formatDate(sprint.startDate)} – {formatDate(sprint.endDate)}</div>
			<div class="mt-1">{remainingCards} cards remaining · {completedPoints}/{totalPoints} pts</div>
		</div>
	</div>

	<div class="mt-4">
		<div class="flex items-center justify-between text-sm">
			<span>{progress}% completed</span>
			<span>{totalPoints - completedPoints} points left</span>
		</div>
		<div class="mt-1 h-2 overflow-hidden rounded-full bg-muted">
			<div class="h-full bg-primary transition-all" style="width: {progress}%"></div>
		</div>
	</div>
</div>
