<script lang="ts">
	import type { Doc, Id } from '$convex/_generated/dataModel';
	import BoardColumn from './board-column.svelte';
	import CardDetailDrawer from './card-detail-drawer.svelte';
	import { useConvexClient } from '@mmailaender/convex-svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { api } from '$convex/_generated/api.js';
	import { showErrorToast } from '$lib/toast.js';

	interface Props {
		board: Doc<'boards'>;
		columns: Doc<'columns'>[];
		cards: Doc<'cards'>[];
	}

	let { board, columns, cards }: Props = $props();

	const client = useConvexClient();

	// Sort columns by board.columnOrder, fall back to column.order for any not in the array.
	let orderedColumns = $derived.by(() => {
		const orderMap = new Map(board.columnOrder.map((id, i) => [id, i]));
		return [...columns].sort((a, b) => {
			const ai = orderMap.get(a._id) ?? a.order;
			const bi = orderMap.get(b._id) ?? b.order;
			return ai - bi;
		});
	});

	// Group cards by columnId.
	let cardsByColumn = $derived.by(() => {
		const map = new SvelteMap<string, Doc<'cards'>[]>();
		for (const card of cards) {
			const arr = map.get(card.columnId) ?? [];
			arr.push(card);
			map.set(card.columnId, arr);
		}
		// Sort cards by order within each column.
		for (const arr of map.values()) {
			arr.sort((a, b) => a.order - b.order);
		}
		return map;
	});

	let selectedCardId = $state<string | null>(null);
	let selectedCard = $derived(cards.find((c) => c._id === selectedCardId) ?? null);

	async function handleMoveCard(cardId: string, targetColumnId: string, newOrder: number) {
		try {
			await client.mutation(api.cards.move, {
				cardId: cardId as Id<'cards'>,
				targetColumnId: targetColumnId as Id<'columns'>,
				newOrder
			});
		} catch (error) {
			showErrorToast(error, 'Failed to move card');
		}
	}
</script>

<div class="flex h-full gap-4 overflow-x-auto p-4">
	{#each orderedColumns as column (column._id)}
		<BoardColumn
			{column}
			cards={cardsByColumn.get(column._id) ?? []}
			onMoveCard={handleMoveCard}
			onCardClick={(cardId) => (selectedCardId = cardId)}
		/>
	{/each}
</div>

{#if selectedCard}
	<CardDetailDrawer card={selectedCard} onClose={() => (selectedCardId = null)} />
{/if}
