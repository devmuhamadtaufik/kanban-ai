<script lang="ts">
	import type { Doc } from '$convex/_generated/dataModel';

	interface Props {
		sprint: Doc<'sprints'>;
		cards: Doc<'cards'>[];
	}

	let { sprint, cards }: Props = $props();

	const days = $derived.by(() => {
		const result: { date: number; remaining: number }[] = [];
		const total = cards.reduce((sum, c) => sum + (c.storyPoints ?? 0), 0);
		const start = sprint.startDate;
		const end = sprint.endDate;
		const dayCount = Math.max(1, Math.ceil((end - start) / 86400000));

		let remaining = total;
		for (let i = 0; i <= dayCount; i++) {
			const day = start + i * 86400000;
			// Treat a card as completed if its column name implies done. Without
			// column data here we approximate by card updates — for MVP we just
			// draw ideal/actual based on current completed points.
			const completedToday = cards.filter(
				(c) => c.updatedAt >= day - 86400000 && c.updatedAt < day && c.storyPoints
			).length;
			remaining = Math.max(0, remaining - completedToday * 2); // rough approximation
			result.push({ date: day, remaining });
		}
		return result;
	});

	const total = $derived(cards.reduce((sum, c) => sum + (c.storyPoints ?? 0), 0));
	const completed = $derived(
		cards.filter((c) => c.storyPoints).reduce((sum, c) => sum + (c.storyPoints ?? 0), 0)
	);
	const remaining = $derived(total - completed);

	const width = 600;
	const height = 200;
	const padding = 32;

	const xFor = (i: number) => padding + (i / Math.max(1, days.length - 1)) * (width - 2 * padding);
	const yFor = (value: number) =>
		height - padding - (value / Math.max(1, total)) * (height - 2 * padding);

	const actualPath = $derived(
		days.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(d.remaining)}`).join(' ')
	);
</script>

<div class="rounded-lg border bg-card p-4 shadow-sm">
	<div class="mb-3 flex items-center justify-between">
		<h3 class="text-sm font-medium">Burndown Chart</h3>
		<div class="text-xs text-muted-foreground">{total} pts total · {remaining} remaining</div>
	</div>

	<svg viewBox="0 0 {width} {height}" class="h-48 w-full">
		<!-- Ideal line -->
		<line
			x1={xFor(0)}
			y1={yFor(total)}
			x2={xFor(days.length - 1)}
			y2={yFor(0)}
			class="stroke-muted-foreground"
			stroke-dasharray="4 4"
		/>

		<!-- Actual remaining -->
		<path d={actualPath} fill="none" class="stroke-primary" stroke-width="2" />

		<!-- Dots for actual -->
		{#each days as d, i (d.date)}
			<circle cx={xFor(i)} cy={yFor(d.remaining)} r="3" class="fill-primary" />
		{/each}

		<!-- Axes -->
		<line
			x1={padding}
			y1={height - padding}
			x2={width - padding}
			y2={height - padding}
			class="stroke-border"
		/>
		<line x1={padding} y1={padding} x2={padding} y2={height - padding} class="stroke-border" />
	</svg>
</div>
