<script lang="ts">
	import type { Doc } from '$convex/_generated/dataModel';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { Flag, Calendar, Trash2, Loader2 } from '@lucide/svelte';
	import { useConvexClient } from '@mmailaender/convex-svelte';
	import { api } from '$convex/_generated/api.js';
	import { toast } from 'svelte-sonner';
	import { showErrorToast } from '$lib/toast.js';

	interface Props {
		card: Doc<'cards'>;
		onClose: () => void;
	}

	let { card, onClose }: Props = $props();

	const client = useConvexClient();

	let title = $state(card.title);
	let description = $state(card.description ?? '');
	let priority = $state(card.priority);
	let storyPoints = $state(card.storyPoints?.toString() ?? '');
	let isSaving = $state(false);
	let isDeleting = $state(false);

	let isTitleDirty = $derived(title !== card.title);
	let isDescriptionDirty = $derived(description !== (card.description ?? ''));
	let isStoryPointsDirty = $derived(storyPoints !== (card.storyPoints?.toString() ?? ''));

	const priorities = [
		{ value: 'low', label: 'Low' },
		{ value: 'medium', label: 'Medium' },
		{ value: 'high', label: 'High' },
		{ value: 'urgent', label: 'Urgent' }
	];

	const priorityColors: Record<string, string> = {
		low: 'text-muted-foreground',
		medium: 'text-blue-500',
		high: 'text-orange-500',
		urgent: 'text-destructive'
	};

	async function saveTitle() {
		if (!isTitleDirty || !title.trim()) return;
		isSaving = true;
		try {
			await client.mutation(api.cards.update, { cardId: card._id as never, title: title.trim() });
			toast.success('Saved');
		} catch (error) {
			showErrorToast(error, 'Failed to save');
		} finally {
			isSaving = false;
		}
	}

	async function saveDescription() {
		if (!isDescriptionDirty) return;
		isSaving = true;
		try {
			await client.mutation(api.cards.update, {
				cardId: card._id as never,
				description: description.trim() || undefined
			});
			toast.success('Saved');
		} catch (error) {
			showErrorToast(error, 'Failed to save');
		} finally {
			isSaving = false;
		}
	}

	async function savePriority(value: string) {
		isSaving = true;
		try {
			await client.mutation(api.cards.update, {
				cardId: card._id as never,
				priority: value as never
			});
			priority = value as (typeof card)['priority'];
			toast.success('Saved');
		} catch (error) {
			showErrorToast(error, 'Failed to save');
		} finally {
			isSaving = false;
		}
	}

	async function saveStoryPoints() {
		if (!isStoryPointsDirty) return;
		isSaving = true;
		try {
			const points = storyPoints.trim() ? Number(storyPoints) : undefined;
			await client.mutation(api.cards.setStoryPoints, {
				cardId: card._id as never,
				storyPoints: points
			});
			toast.success('Saved');
		} catch (error) {
			showErrorToast(error, 'Failed to save');
		} finally {
			isSaving = false;
		}
	}

	async function handleDelete() {
		isDeleting = true;
		try {
			await client.mutation(api.cards.remove, { cardId: card._id as never });
			toast.success('Card deleted');
			onClose();
		} catch (error) {
			showErrorToast(error, 'Failed to delete card');
		} finally {
			isDeleting = false;
		}
	}

	function formatDate(ts: number): string {
		return new Date(ts).toLocaleDateString('en', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}
</script>

<Sheet.Root
	open
	onOpenChange={(open) => {
		if (!open) onClose();
	}}
>
	<Sheet.Portal>
		<Sheet.Content class="w-full overflow-y-auto sm:max-w-lg">
			<Sheet.Header>
				<div class="flex items-start justify-between gap-2">
					<div class="min-w-0 flex-1">
						<Input
							bind:value={title}
							class="border-none px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
							onblur={saveTitle}
							onkeydown={(e) => {
								if (e.key === 'Enter') e.currentTarget.blur();
							}}
						/>
						<p class="mt-1 text-xs text-muted-foreground">
							Created {formatDate(card.createdAt)}
						</p>
					</div>
					{#if isSaving}
						<Loader2 class="size-4 animate-spin text-muted-foreground" />
					{/if}
				</div>
			</Sheet.Header>

			<div class="flex-1 space-y-6 px-4 pb-4">
				<!-- Description -->
				<div class="space-y-2">
					<Label class="text-xs font-medium text-muted-foreground">Description</Label>
					<textarea
						bind:value={description}
						placeholder="Add a more detailed description..."
						class="flex min-h-24 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
						onblur={saveDescription}
					></textarea>
				</div>

				<Separator />

				<!-- Properties -->
				<div class="space-y-4">
					<h3 class="text-sm font-medium">Properties</h3>

					<!-- Priority -->
					<div class="flex items-center gap-3">
						<div class="flex w-24 items-center gap-1.5 text-sm text-muted-foreground">
							<Flag class="size-3.5" />
							Priority
						</div>
						<div class="flex-1">
							<Select.Root
								type="single"
								value={priority}
								onValueChange={(v) => v && savePriority(v)}
							>
								<Select.Trigger class="h-8 w-full">
									<span class={priorityColors[priority]}>
										{priorities.find((p) => p.value === priority)?.label ?? priority}
									</span>
								</Select.Trigger>
								<Select.Content>
									{#each priorities as p (p.value)}
										<Select.Item value={p.value}>{p.label}</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>
						</div>
					</div>

					<!-- Story Points -->
					<div class="flex items-center gap-3">
						<div class="flex w-24 items-center gap-1.5 text-sm text-muted-foreground">
							<span class="text-xs">SP</span>
							Story Points
						</div>
						<Input
							type="number"
							bind:value={storyPoints}
							placeholder="—"
							class="h-8 w-20"
							onblur={saveStoryPoints}
							onkeydown={(e) => {
								if (e.key === 'Enter') e.currentTarget.blur();
							}}
						/>
					</div>

					<!-- Due Date -->
					<div class="flex items-center gap-3">
						<div class="flex w-24 items-center gap-1.5 text-sm text-muted-foreground">
							<Calendar class="size-3.5" />
							Due Date
						</div>
						<span class="text-sm text-muted-foreground">
							{card.dueDate ? formatDate(card.dueDate) : 'Not set'}
						</span>
					</div>
				</div>

				<Separator />

				<!-- Danger zone -->
				<div class="pt-2">
					<Button variant="destructive" size="sm" onclick={handleDelete} disabled={isDeleting}>
						<Trash2 class="size-4" />
						{isDeleting ? 'Deleting...' : 'Delete card'}
					</Button>
				</div>
			</div>
		</Sheet.Content>
	</Sheet.Portal>
</Sheet.Root>
