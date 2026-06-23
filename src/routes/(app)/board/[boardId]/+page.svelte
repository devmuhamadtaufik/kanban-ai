<script lang="ts">
	import { api } from '$convex/_generated/api.js';
	import { useQuery, useConvexClient } from '@mmailaender/convex-svelte';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Plus, ChevronLeft } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { showErrorToast } from '$lib/toast.js';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { siteConfig } from '$lib/config.js';
	import BoardView from '$lib/components/board/board-view.svelte';
	import type { Id } from '$convex/_generated/dataModel';

	const boardId = $derived(page.params.boardId as Id<'boards'>);

	const boardResponse = useQuery(api.boards.get, () => ({ boardId }));
	let board = $derived(boardResponse.data);

	const columnsResponse = useQuery(api.columns.list, () => ({ boardId }));
	let columns = $derived(columnsResponse.data ?? []);

	const cardsResponse = useQuery(api.cards.list, () => ({ boardId }));
	let cards = $derived(cardsResponse.data ?? []);

	const client = useConvexClient();

	let isAddColumnOpen = $state(false);
	let newColumnName = $state('');
	let isAddingColumn = $state(false);

	async function handleAddColumn() {
		if (!newColumnName.trim()) return;
		isAddingColumn = true;
		try {
			await client.mutation(api.columns.create, {
				boardId,
				name: newColumnName.trim()
			});
			toast.success('Column added');
			newColumnName = '';
			isAddColumnOpen = false;
		} catch (error) {
			showErrorToast(error, 'Failed to add column');
		} finally {
			isAddingColumn = false;
		}
	}
</script>

<svelte:head>
	<title>{board?.name ?? 'Board'} | {siteConfig.name}</title>
</svelte:head>

<header
	class="flex h-16 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12"
>
	<div class="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
		<Sidebar.Trigger class="-ml-1" />
		<Separator orientation="vertical" class="mx-2 data-[orientation=vertical]:h-4" />
		<Button variant="ghost" size="icon" class="size-7">
			<a href={resolve('/boards')}>
				<ChevronLeft class="size-4" />
			</a>
		</Button>
		<h1 class="text-base font-medium">{board?.name ?? 'Loading...'}</h1>
		<div class="ml-auto flex items-center gap-2">
			<Dialog.Root bind:open={isAddColumnOpen}>
				<Dialog.Trigger>
					{#snippet child({ props })}
						<Button size="sm" variant="outline" {...props}>
							<Plus class="size-4" />
							Add Column
						</Button>
					{/snippet}
				</Dialog.Trigger>
				<Dialog.Content class="sm:max-w-md">
					<Dialog.Header>
						<Dialog.Title>Add column</Dialog.Title>
						<Dialog.Description>Add a new column to your board.</Dialog.Description>
					</Dialog.Header>
					<div class="space-y-4 py-4">
						<div class="space-y-2">
							<Label for="column-name">Column name</Label>
							<Input
								id="column-name"
								bind:value={newColumnName}
								placeholder="e.g. To Do"
								onkeydown={(e) => {
									if (e.key === 'Enter') handleAddColumn();
								}}
							/>
						</div>
					</div>
					<Dialog.Footer>
						<Button
							variant="outline"
							onclick={() => (isAddColumnOpen = false)}
							disabled={isAddingColumn}
						>
							Cancel
						</Button>
						<Button onclick={handleAddColumn} disabled={isAddingColumn || !newColumnName.trim()}>
							{isAddingColumn ? 'Adding...' : 'Add'}
						</Button>
					</Dialog.Footer>
				</Dialog.Content>
			</Dialog.Root>
		</div>
	</div>
</header>

<div class="flex flex-1 flex-col overflow-hidden">
	{#if boardResponse.isLoading}
		<div class="flex items-center justify-center py-20 text-muted-foreground">Loading board...</div>
	{:else if !board}
		<div class="flex flex-col items-center justify-center py-20 text-center">
			<h3 class="text-lg font-medium">Board not found</h3>
			<p class="mt-1 text-sm text-muted-foreground">This board may have been deleted.</p>
			<Button class="mt-4"><a href={resolve('/boards')}>Back to Boards</a></Button>
		</div>
	{:else}
		<BoardView {board} {columns} {cards} />
	{/if}
</div>
