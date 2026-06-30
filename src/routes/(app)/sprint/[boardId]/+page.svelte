<script lang="ts">
	import { page } from '$app/state';
	import { api } from '$convex/_generated/api.js';
	import { useQuery } from '@mmailaender/convex-svelte';
	import type { Id } from '$convex/_generated/dataModel';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { ChevronLeft } from '@lucide/svelte';
	import { resolve } from '$app/paths';
	import { siteConfig } from '$lib/config.js';
	import SprintView from '$lib/components/sprint/sprint-view.svelte';

	const boardId = $derived(page.params.boardId as Id<'boards'>);
	const boardsResponse = useQuery(api.boards.list, {});
	let boards = $derived(boardsResponse.data ?? []);
	let selectedBoardId = $derived.by(() => boardId);

	const boardOptions = $derived(
		boards.map((b) => ({
			value: b._id,
			label: b.name
		}))
	);
</script>

<svelte:head>
	<title>Sprint | {siteConfig.name}</title>
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
			{#if boardOptions.length > 0}
				<Select.Root
					type="single"
					value={selectedBoardId}
					onValueChange={(v) => {
						if (v) selectedBoardId = v as Id<'boards'>;
					}}
				>
					<Select.Trigger class="w-48">
						{boardOptions.find((b) => b.value === selectedBoardId)?.label ?? 'Select board'}
					</Select.Trigger>
					<Select.Content>
						{#each boardOptions as b (b.value)}
							<Select.Item value={b.value}>{b.label}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			{/if}
		</div>
	</div>
</header>

<div class="flex flex-1 flex-col overflow-hidden">
	<SprintView boardId={selectedBoardId} />
</div>
