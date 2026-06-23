<script lang="ts">
	import { api } from '$convex/_generated/api.js';
	import { useQuery, useConvexClient } from '@mmailaender/convex-svelte';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Plus, Folder, MoreVertical } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { showErrorToast } from '$lib/toast.js';
	import { siteConfig } from '$lib/config.js';
	import type { Id } from '$convex/_generated/dataModel';

	const boardsResponse = useQuery(api.boards.list, {});
	let boards = $derived(boardsResponse.data);
	const client = useConvexClient();

	let isCreateOpen = $state(false);
	let newBoardName = $state('');
	let isCreating = $state(false);

	async function handleCreateBoard() {
		if (!newBoardName.trim()) return;
		isCreating = true;
		try {
			await client.mutation(api.boards.create, { name: newBoardName.trim() });
			toast.success('Board created');
			newBoardName = '';
			isCreateOpen = false;
		} catch (error) {
			showErrorToast(error, 'Failed to create board');
		} finally {
			isCreating = false;
		}
	}

	async function handleDeleteBoard(boardId: Id<'boards'>) {
		try {
			await client.mutation(api.boards.remove, { boardId });
			toast.success('Board deleted');
		} catch (error) {
			showErrorToast(error, 'Failed to delete board');
		}
	}
</script>

<svelte:head>
	<title>Boards | {siteConfig.name}</title>
</svelte:head>

<header
	class="flex h-16 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12"
>
	<div class="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
		<Sidebar.Trigger class="-ml-1" />
		<Separator orientation="vertical" class="mx-2 data-[orientation=vertical]:h-4" />
		<h1 class="text-base font-medium">Boards</h1>
		<div class="ml-auto flex items-center gap-2">
			<Dialog.Root bind:open={isCreateOpen}>
				<Dialog.Trigger>
					{#snippet child({ props })}
						<Button size="sm" {...props}>
							<Plus class="size-4" />
							New Board
						</Button>
					{/snippet}
				</Dialog.Trigger>
				<Dialog.Content class="sm:max-w-md">
					<Dialog.Header>
						<Dialog.Title>Create new board</Dialog.Title>
						<Dialog.Description>
							Give your board a name to get started. You can rename it later.
						</Dialog.Description>
					</Dialog.Header>
					<div class="space-y-4 py-4">
						<div class="space-y-2">
							<Label for="board-name">Board name</Label>
							<Input
								id="board-name"
								bind:value={newBoardName}
								placeholder="e.g. Product Roadmap Q1"
								onkeydown={(e) => {
									if (e.key === 'Enter') handleCreateBoard();
								}}
							/>
						</div>
					</div>
					<Dialog.Footer>
						<Button variant="outline" onclick={() => (isCreateOpen = false)} disabled={isCreating}>
							Cancel
						</Button>
						<Button onclick={handleCreateBoard} disabled={isCreating || !newBoardName.trim()}>
							{isCreating ? 'Creating...' : 'Create'}
						</Button>
					</Dialog.Footer>
				</Dialog.Content>
			</Dialog.Root>
		</div>
	</div>
</header>

<div class="flex flex-1 flex-col">
	<div class="flex-1 space-y-6 p-6 md:p-10">
		<div>
			<h2 class="text-2xl font-bold tracking-tight">Boards</h2>
			<p class="text-muted-foreground">Manage your scrum boards and start planning sprints.</p>
		</div>

		<Separator />

		{#if boardsResponse.isLoading}
			<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
				{#each Array(3) as _ (_)}
					<div class="h-32 animate-pulse rounded-lg border bg-muted/40"></div>
				{/each}
			</div>
		{:else if !boards || boards.length === 0}
			<div class="flex flex-col items-center justify-center py-20 text-center">
				<Folder class="mb-4 size-12 text-muted-foreground/40" />
				<h3 class="text-lg font-medium">No boards yet</h3>
				<p class="mt-1 text-sm text-muted-foreground">
					Create your first board to start managing your sprint.
				</p>
				<Button class="mt-4" onclick={() => (isCreateOpen = true)}>
					<Plus class="size-4" />
					Create Board
				</Button>
			</div>
		{:else}
			<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
				{#each boards as board (board._id)}
					<Card.Root class="group relative transition-shadow hover:shadow-md">
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
						<a href={`/board/${board._id}`} class="block p-6">
							<Card.Header class="p-0 pb-4">
								<Card.Title class="text-lg">{board.name}</Card.Title>
								{#if board.description}
									<Card.Description class="line-clamp-2">{board.description}</Card.Description>
								{/if}
							</Card.Header>
							<Card.Content class="p-0">
								<div class="flex items-center gap-4 text-sm text-muted-foreground">
									<span>{board.columnOrder.length} columns</span>
								</div>
							</Card.Content>
						</a>
						<div
							class="absolute top-4 right-4 opacity-0 transition-opacity group-hover:opacity-100"
						>
							<Button
								variant="ghost"
								size="icon"
								class="size-8 text-muted-foreground"
								onclick={(e) => {
									e.preventDefault();
									e.stopPropagation();
									handleDeleteBoard(board._id);
								}}
							>
								<MoreVertical class="size-4" />
								<span class="sr-only">Delete board</span>
							</Button>
						</div>
					</Card.Root>
				{/each}
			</div>
		{/if}
	</div>
</div>
