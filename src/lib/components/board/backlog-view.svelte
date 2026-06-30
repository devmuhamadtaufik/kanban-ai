<script lang="ts">
	import { api } from '$convex/_generated/api.js';
	import { useQuery, useConvexClient } from '@mmailaender/convex-svelte';
	import type { Id } from '$convex/_generated/dataModel';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Plus, Filter } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { showErrorToast } from '$lib/toast.js';
	import { siteConfig } from '$lib/config.js';
	import BacklogCard from '$lib/components/board/backlog-card.svelte';
	import CardDetailDrawer from '$lib/components/board/card-detail-drawer.svelte';

	let { boardId }: { boardId: Id<'boards'> } = $props();

	const boardResponse = useQuery(api.boards.get, () => ({ boardId }));
	const cardsResponse = useQuery(api.cards.listForBacklog, () => ({ boardId }));
	const labelsResponse = useQuery(api.labels.list, () => ({ boardId }));
	const sprintsResponse = useQuery(api.sprints.list, () => ({ boardId }));

	let board = $derived(boardResponse.data);
	let cards = $derived(cardsResponse.data ?? []);
	let labels = $derived(labelsResponse.data ?? []);
	let sprints = $derived(sprintsResponse.data ?? []);

	const client = useConvexClient();

	let search = $state('');
	let priorityFilter = $state('all');
	let selectedCardId = $state<string | null>(null);
	let selectedCard = $derived(cards.find((c) => c._id === selectedCardId) ?? null);
	let isCreating = $state(false);
	let newTitle = $state('');

	const priorities = [
		{ value: 'all', label: 'All priorities' },
		{ value: 'low', label: 'Low' },
		{ value: 'medium', label: 'Medium' },
		{ value: 'high', label: 'High' },
		{ value: 'urgent', label: 'Urgent' }
	];

	const filteredCards = $derived.by(() => {
		let result = cards;
		if (search.trim()) {
			const q = search.toLowerCase();
			result = result.filter(
				(c) => c.title.toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q)
			);
		}
		if (priorityFilter !== 'all') {
			result = result.filter((c) => c.priority === priorityFilter);
		}
		return result.sort((a, b) => b.order - a.order);
	});

	async function handleCreateCard() {
		if (!newTitle.trim()) return;
		isCreating = true;
		try {
			const columns = await client.query(api.columns.list, { boardId });
			const firstColumnId = columns?.[0]?._id;
			if (!firstColumnId) {
				toast.error('Create a column on the board first');
				return;
			}
			await client.mutation(api.cards.create, {
				boardId,
				columnId: firstColumnId,
				title: newTitle.trim()
			});
			toast.success('Backlog item created');
			newTitle = '';
		} catch (error) {
			showErrorToast(error, 'Failed to create item');
		} finally {
			isCreating = false;
		}
	}

	async function handleAddToSprint(cardId: Id<'cards'>, sprintId: Id<'sprints'>) {
		try {
			await client.mutation(api.cards.update, { cardId, sprintId });
			toast.success('Added to sprint');
		} catch (error) {
			showErrorToast(error, 'Failed to add to sprint');
		}
	}
</script>

<svelte:head>
	<title>{board?.name ?? 'Backlog'} Backlog | {siteConfig.name}</title>
</svelte:head>

<header
	class="flex h-16 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12"
>
	<div class="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
		<Sidebar.Trigger class="-ml-1" />
		<Separator orientation="vertical" class="mx-2 data-[orientation=vertical]:h-4" />
		<h1 class="text-base font-medium">{board?.name ?? 'Loading...'} Backlog</h1>
	</div>
</header>

<div class="flex flex-1 flex-col overflow-hidden">
	{#if boardResponse.isLoading}
		<div class="flex items-center justify-center py-20 text-muted-foreground">
			Loading backlog...
		</div>
	{:else if !board}
		<div class="flex flex-col items-center justify-center py-20 text-center">
			<h3 class="text-lg font-medium">Board not found</h3>
		</div>
	{:else}
		<div class="flex-1 space-y-6 overflow-y-auto p-6 md:p-10">
			<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div class="flex flex-1 items-center gap-2">
					<div class="relative max-w-md flex-1">
						<Filter class="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
						<Input bind:value={search} placeholder="Search backlog..." class="pl-9" />
					</div>
					<Select.Root type="single" bind:value={priorityFilter}>
						<Select.Trigger class="w-40">
							{priorities.find((p) => p.value === priorityFilter)?.label ?? 'Filter'}
						</Select.Trigger>
						<Select.Content>
							{#each priorities as p (p.value)}
								<Select.Item value={p.value}>{p.label}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
				<Button
					size="sm"
					onclick={() => {
						if (!newTitle.trim()) return;
						handleCreateCard();
					}}
					disabled={isCreating || !newTitle.trim()}
				>
					<Plus class="size-4" />
					Add Item
				</Button>
			</div>

			<div class="flex gap-2">
				<Input
					bind:value={newTitle}
					placeholder="Create a new backlog item..."
					class="max-w-md"
					onkeydown={(e) => {
						if (e.key === 'Enter') handleCreateCard();
					}}
				/>
			</div>

			<Separator />

			{#if filteredCards.length === 0}
				<div class="py-20 text-center text-muted-foreground">No backlog items found.</div>
			{:else}
				<div class="grid gap-3">
					{#each filteredCards as card (card._id)}
						<BacklogCard
							{card}
							{labels}
							onClick={() => (selectedCardId = card._id)}
							onAddToSprint={sprints.length > 0
								? (id) => {
										const planned = sprints.find((s) => s.status === 'planned');
										if (planned) handleAddToSprint(id, planned._id);
									}
								: undefined}
						/>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>

{#if selectedCard}
	<CardDetailDrawer card={selectedCard} onClose={() => (selectedCardId = null)} />
{/if}
