<script lang="ts">
	import { api } from '$convex/_generated/api.js';
	import { useQuery, useConvexClient } from '@mmailaender/convex-svelte';
	import type { Id } from '$convex/_generated/dataModel';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { ChevronLeft, Plus, Play, CheckCircle2, CalendarDays } from '@lucide/svelte';
	import { resolve } from '$app/paths';
	import { siteConfig } from '$lib/config.js';
	import { toast } from 'svelte-sonner';
	import { showErrorToast } from '$lib/toast.js';
	import SprintHeader from '$lib/components/sprint/sprint-header.svelte';
	import BurndownChart from '$lib/components/sprint/burndown-chart.svelte';
	import PlanningPokerCard from '$lib/components/sprint/planning-poker-card.svelte';
	import BoardCard from '$lib/components/board/board-card.svelte';
	import CardDetailDrawer from '$lib/components/board/card-detail-drawer.svelte';

	let { boardId }: { boardId: Id<'boards'> } = $props();

	const boardResponse = useQuery(api.boards.get, () => ({ boardId }));
	const sprintsResponse = useQuery(api.sprints.list, () => ({ boardId }));
	const cardsResponse = useQuery(api.cards.list, () => ({ boardId }));
	const columnsResponse = useQuery(api.columns.list, () => ({ boardId }));

	let board = $derived(boardResponse.data);
	let sprints = $derived(sprintsResponse.data ?? []);
	let cards = $derived(cardsResponse.data ?? []);
	let columns = $derived(columnsResponse.data ?? []);

	const client = useConvexClient();

	let activeSprint = $derived(sprints.find((s) => s.status === 'active') ?? null);
	let plannedSprints = $derived(sprints.filter((s) => s.status === 'planned'));
	let selectedSprintId = $state<string | null>(activeSprint?._id ?? plannedSprints[0]?._id ?? null);

	let selectedSprint = $derived(
		sprints.find((s) => s._id === selectedSprintId) ?? activeSprint ?? plannedSprints[0] ?? null
	);
	let sprintCards = $derived(
		selectedSprint ? cards.filter((c) => c.sprintId === selectedSprint._id) : []
	);
	let doneColumn = $derived(columns.find((c) => c.name.toLowerCase().includes('done')) ?? null);
	let completedPoints = $derived(
		sprintCards
			.filter((c) => doneColumn && c.columnId === doneColumn._id)
			.reduce((sum, c) => sum + (c.storyPoints ?? 0), 0)
	);
	let totalPoints = $derived(sprintCards.reduce((sum, c) => sum + (c.storyPoints ?? 0), 0));
	let remainingCards = $derived(
		sprintCards.filter((c) => !doneColumn || c.columnId !== doneColumn._id).length
	);

	let selectedCardId = $state<string | null>(null);
	let selectedCard = $derived(cards.find((c) => c._id === selectedCardId) ?? null);

	let isCreateOpen = $state(false);
	let newSprintName = $state('');
	let newSprintGoal = $state('');
	let startDate = $state('');
	let endDate = $state('');
	let isCreating = $state(false);

	function timestampFromInput(value: string): number {
		return new Date(value).getTime();
	}

	async function handleCreateSprint() {
		if (!newSprintName.trim() || !startDate || !endDate) return;
		const start = timestampFromInput(startDate);
		const end = timestampFromInput(endDate);
		if (end <= start) {
			toast.error('End date must be after start date');
			return;
		}
		isCreating = true;
		try {
			const id = await client.mutation(api.sprints.create, {
				boardId,
				name: newSprintName.trim(),
				goal: newSprintGoal.trim() || undefined,
				startDate: start,
				endDate: end
			});
			selectedSprintId = id;
			toast.success('Sprint created');
			newSprintName = '';
			newSprintGoal = '';
			startDate = '';
			endDate = '';
			isCreateOpen = false;
		} catch (error) {
			showErrorToast(error, 'Failed to create sprint');
		} finally {
			isCreating = false;
		}
	}

	async function handleStartSprint(sprintId: Id<'sprints'>) {
		try {
			await client.mutation(api.sprints.start, { sprintId });
			toast.success('Sprint started');
		} catch (error) {
			showErrorToast(error, 'Failed to start sprint');
		}
	}

	async function handleCompleteSprint(sprintId: Id<'sprints'>) {
		try {
			await client.mutation(api.sprints.complete, { sprintId });
			toast.success('Sprint completed');
		} catch (error) {
			showErrorToast(error, 'Failed to complete sprint');
		}
	}

	async function handleVote(cardId: Id<'cards'>, points: number) {
		try {
			await client.mutation(api.cards.setStoryPoints, { cardId, storyPoints: points });
			toast.success('Story points saved');
		} catch (error) {
			showErrorToast(error, 'Failed to save estimate');
		}
	}

	async function handleRemoveFromSprint(cardId: Id<'cards'>) {
		try {
			await client.mutation(api.cards.update, { cardId });
			toast.success('Removed from sprint');
		} catch (error) {
			showErrorToast(error, 'Failed to remove from sprint');
		}
	}
</script>

<svelte:head>
	<title>{board?.name ?? 'Sprint'} Sprint | {siteConfig.name}</title>
</svelte:head>

<header
	class="flex h-16 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12"
>
	<div class="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
		<Sidebar.Trigger class="-ml-1" />
		<Separator orientation="vertical" class="mx-2 data-[orientation=vertical]:h-4" />
		<Button variant="ghost" size="icon" class="size-7">
			<a href={resolve('/boards')}><ChevronLeft class="size-4" /></a>
		</Button>
		<h1 class="text-base font-medium">Sprint</h1>
		<div class="ml-auto flex items-center gap-2">
			{#if sprints.length > 0}
				<Select.Root
					type="single"
					value={selectedSprintId ?? ''}
					onValueChange={(v) => {
						if (v) selectedSprintId = v as Id<'sprints'>;
					}}
				>
					<Select.Trigger class="w-48">
						{selectedSprint?.name ?? 'Select sprint'}
					</Select.Trigger>
					<Select.Content>
						{#each sprints as sprint (sprint._id)}
							<Select.Item value={sprint._id}>{sprint.name} ({sprint.status})</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			{/if}
			<Dialog.Root bind:open={isCreateOpen}>
				<Dialog.Trigger>
					{#snippet child({ props })}
						<Button size="sm" {...props}>
							<Plus class="size-4" />
							New Sprint
						</Button>
					{/snippet}
				</Dialog.Trigger>
				<Dialog.Content class="sm:max-w-md">
					<Dialog.Header>
						<Dialog.Title>Create sprint</Dialog.Title>
						<Dialog.Description>Plan a new iteration for this board.</Dialog.Description>
					</Dialog.Header>
					<div class="space-y-4 py-4">
						<div class="space-y-2">
							<Label for="sprint-name">Name</Label>
							<Input id="sprint-name" bind:value={newSprintName} placeholder="Sprint 1" />
						</div>
						<div class="space-y-2">
							<Label for="sprint-goal">Goal</Label>
							<Input
								id="sprint-goal"
								bind:value={newSprintGoal}
								placeholder="What we want to achieve"
							/>
						</div>
						<div class="grid grid-cols-2 gap-3">
							<div class="space-y-2">
								<Label for="start-date">Start</Label>
								<Input id="start-date" type="date" bind:value={startDate} />
							</div>
							<div class="space-y-2">
								<Label for="end-date">End</Label>
								<Input id="end-date" type="date" bind:value={endDate} />
							</div>
						</div>
					</div>
					<Dialog.Footer>
						<Button variant="outline" onclick={() => (isCreateOpen = false)} disabled={isCreating}
							>Cancel</Button
						>
						<Button
							onclick={handleCreateSprint}
							disabled={isCreating || !newSprintName.trim() || !startDate || !endDate}
						>
							{isCreating ? 'Creating...' : 'Create'}
						</Button>
					</Dialog.Footer>
				</Dialog.Content>
			</Dialog.Root>
		</div>
	</div>
</header>

<div class="flex flex-1 flex-col overflow-hidden">
	{#if boardResponse.isLoading}
		<div class="flex items-center justify-center py-20 text-muted-foreground">
			Loading sprint...
		</div>
	{:else if !board}
		<div class="flex flex-col items-center justify-center py-20 text-center">
			<h3 class="text-lg font-medium">Board not found</h3>
		</div>
	{:else if !selectedSprint}
		<div class="flex flex-col items-center justify-center py-20 text-center">
			<CalendarDays class="mx-auto mb-4 size-12 text-muted-foreground/40" />
			<h3 class="text-lg font-medium">No sprints yet</h3>
			<p class="mt-1 text-sm text-muted-foreground">Create a sprint to start planning.</p>
			<Button class="mt-4" onclick={() => (isCreateOpen = true)}>Create Sprint</Button>
		</div>
	{:else}
		<div class="flex-1 space-y-6 overflow-y-auto p-6 md:p-10">
			<SprintHeader sprint={selectedSprint} {totalPoints} {completedPoints} {remainingCards} />

			<div class="flex gap-2">
				{#if selectedSprint.status === 'planned'}
					<Button size="sm" onclick={() => handleStartSprint(selectedSprint._id)}>
						<Play class="mr-2 size-4" /> Start Sprint
					</Button>
				{:else if selectedSprint.status === 'active'}
					<Button size="sm" onclick={() => handleCompleteSprint(selectedSprint._id)}>
						<CheckCircle2 class="mr-2 size-4" /> Complete Sprint
					</Button>
				{/if}
			</div>

			<Separator />

			<Tabs.Root value="board" class="w-full">
				<Tabs.List>
					<Tabs.Trigger value="board">Board</Tabs.Trigger>
					<Tabs.Trigger value="burndown">Burndown</Tabs.Trigger>
					<Tabs.Trigger value="poker">Planning Poker</Tabs.Trigger>
				</Tabs.List>

				<Tabs.Content value="board" class="space-y-4">
					{#if sprintCards.length === 0}
						<div class="py-10 text-center text-sm text-muted-foreground">
							No cards in this sprint. Add items from the backlog.
						</div>
					{:else}
						<div class="grid gap-3">
							{#each sprintCards as card (card._id)}
								<div class="flex items-start gap-3">
									<div class="flex-1">
										<BoardCard {card} onClick={() => (selectedCardId = card._id)} />
									</div>
									<Button
										variant="ghost"
										size="sm"
										onclick={() => handleRemoveFromSprint(card._id)}
									>
										Remove
									</Button>
								</div>
							{/each}
						</div>
					{/if}
				</Tabs.Content>

				<Tabs.Content value="burndown">
					<BurndownChart sprint={selectedSprint} cards={sprintCards} />
				</Tabs.Content>

				<Tabs.Content value="poker" class="space-y-4">
					{#if sprintCards.length === 0}
						<div class="py-10 text-center text-sm text-muted-foreground">No cards to estimate.</div>
					{:else}
						<div class="grid gap-3">
							{#each sprintCards.filter((c) => !c.storyPoints) as card (card._id)}
								<PlanningPokerCard {card} onVote={handleVote} />
							{/each}
						</div>
					{/if}
				</Tabs.Content>
			</Tabs.Root>
		</div>
	{/if}
</div>

{#if selectedCard}
	<CardDetailDrawer card={selectedCard} onClose={() => (selectedCardId = null)} />
{/if}
