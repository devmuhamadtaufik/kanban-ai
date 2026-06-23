<script lang="ts">
	import type { Doc } from '$convex/_generated/dataModel';
	import BoardCard from './board-card.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Plus, Trash2, MoreHorizontal } from '@lucide/svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { useConvexClient } from '@mmailaender/convex-svelte';
	import { api } from '$convex/_generated/api.js';
	import { toast } from 'svelte-sonner';
	import { showErrorToast } from '$lib/toast.js';

	interface Props {
		column: Doc<'columns'>;
		cards: Doc<'cards'>[];
		onMoveCard: (cardId: string, targetColumnId: string, newOrder: number) => void;
		onCardClick: (cardId: string) => void;
	}

	let { column, cards, onMoveCard, onCardClick }: Props = $props();

	const client = useConvexClient();

	let isOver = $state(false);

	let isAddingCard = $state(false);
	let newCardTitle = $state('');
	let isCreatingCard = $state(false);

	async function handleCreateCard() {
		if (!newCardTitle.trim()) return;
		isCreatingCard = true;
		try {
			await client.mutation(api.cards.create, {
				boardId: column.boardId,
				columnId: column._id,
				title: newCardTitle.trim()
			});
			toast.success('Card created');
			newCardTitle = '';
			isAddingCard = false;
		} catch (error) {
			showErrorToast(error, 'Failed to create card');
		} finally {
			isCreatingCard = false;
		}
	}

	async function handleDeleteColumn() {
		try {
			await client.mutation(api.columns.remove, { columnId: column._id });
			toast.success('Column deleted');
		} catch (error) {
			showErrorToast(error, 'Failed to delete column');
		}
	}

	async function handleRenameColumn(newName: string) {
		try {
			await client.mutation(api.columns.update, {
				columnId: column._id,
				name: newName
			});
		} catch (error) {
			showErrorToast(error, 'Failed to rename column');
		}
	}

	// WIP limit indicator.
	let overWipLimit = $derived(
		column.wipLimit !== undefined && cards.length > (column.wipLimit ?? 0)
	);
</script>

<div class="flex w-72 shrink-0 flex-col rounded-lg border bg-muted/30">
	<!-- Column header -->
	<div class="flex items-center justify-between px-3 py-2.5">
		<div class="flex min-w-0 items-center gap-2">
			<div class="size-2 rounded-full" style="background-color: {column.color ?? '#94a3b8'}" />
			<input
				class="bg-transparent text-sm font-medium outline-none focus:rounded focus:bg-background focus:px-1 focus:py-0.5"
				value={column.name}
				onchange={(e) => handleRenameColumn(e.currentTarget.value)}
			/>
			<span class="shrink-0 text-xs text-muted-foreground">{cards.length}</span>
			{#if overWipLimit}
				<span class="shrink-0 text-xs font-medium text-destructive">· WIP limit exceeded</span>
			{/if}
		</div>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button variant="ghost" size="icon" class="size-6 shrink-0" {...props}>
						<MoreHorizontal class="size-4" />
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end" class="w-40">
				<DropdownMenu.Item variant="destructive" onclick={handleDeleteColumn}>
					<Trash2 class="mr-2 size-4" />
					Delete
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</div>

	<!-- Cards container (droppable) -->
	<div
		class="flex flex-1 flex-col gap-2 overflow-y-auto p-2"
		class:ring-2={isOver}
		class:ring-primary={isOver}
		class:bg-primary={isOver}
		ondragenter={() => {
			isOver = true;
		}}
		ondragleave={() => {
			isOver = false;
		}}
		ondragover={(e) => e.preventDefault()}
		ondrop={(e) => {
			e.preventDefault();
			isOver = false;
			const cardId = e.dataTransfer?.getData('text/plain');
			if (cardId) {
				onMoveCard(cardId, column._id, cards.length);
			}
		}}
	>
		{#each cards as card (card._id)}
			<BoardCard {card} onClick={() => onCardClick(card._id)} />
		{/each}

		{#if isAddingCard}
			<div class="rounded-md border bg-background p-2">
				<textarea
					class="w-full resize-none bg-transparent text-sm outline-none"
					rows="2"
					bind:value={newCardTitle}
					placeholder="Enter card title..."
					onkeydown={(e) => {
						if (e.key === 'Enter' && !e.shiftKey) {
							e.preventDefault();
							handleCreateCard();
						} else if (e.key === 'Escape') {
							isAddingCard = false;
							newCardTitle = '';
						}
					}}
				></textarea>
				<div class="mt-2 flex gap-2">
					<Button
						size="sm"
						onclick={handleCreateCard}
						disabled={isCreatingCard || !newCardTitle.trim()}
					>
						{isCreatingCard ? '...' : 'Add'}
					</Button>
					<Button
						size="sm"
						variant="ghost"
						onclick={() => {
							isAddingCard = false;
							newCardTitle = '';
						}}
					>
						Cancel
					</Button>
				</div>
			</div>
		{:else}
			<button
				class="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
				onclick={() => (isAddingCard = true)}
			>
				<Plus class="size-3.5" />
				Add card
			</button>
		{/if}
	</div>
</div>
