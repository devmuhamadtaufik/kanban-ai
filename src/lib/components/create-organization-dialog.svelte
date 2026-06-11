<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { invalidateAll } from '$app/navigation';
	import { Debounced } from 'runed';
	import { toast } from 'svelte-sonner';
	import { showErrorToast } from '$lib/toast.js';
	import { authClient } from '$lib/auth-client.js';
	import { slugifyOrganizationName } from '$lib/organizations.js';

	interface Props {
		open?: boolean;
	}

	let { open = $bindable(false) }: Props = $props();

	let name = $state('');
	let slug = $state('');
	let slugEdited = $state(false);
	let isSubmitting = $state(false);
	let slugTaken = $state(false);

	// Follow the name until the user edits the slug manually
	$effect(() => {
		if (!slugEdited) slug = slugifyOrganizationName(name);
	});

	const debouncedSlug = new Debounced(() => slug, 300);

	// Check slug availability as the user types (debounced)
	$effect(() => {
		const candidate = debouncedSlug.current;
		slugTaken = false;
		if (!candidate) return;
		let cancelled = false;
		authClient.organization.checkSlug({ slug: candidate }).then(({ error }) => {
			if (!cancelled && error) slugTaken = true;
		});
		return () => {
			cancelled = true;
		};
	});

	function reset() {
		name = '';
		slug = '';
		slugEdited = false;
		slugTaken = false;
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (!name.trim() || !slug || isSubmitting) return;
		isSubmitting = true;
		try {
			const { data, error } = await authClient.organization.create({
				name: name.trim(),
				slug
			});
			if (error) throw new Error(error.message);
			if (data) {
				await authClient.organization.setActive({ organizationId: data.id });
				await invalidateAll();
			}
			toast.success('Organization created');
			open = false;
			reset();
		} catch (error) {
			showErrorToast(error, 'Failed to create organization');
		} finally {
			isSubmitting = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Create organization</Dialog.Title>
			<Dialog.Description>
				Organizations let you collaborate with your team and share a subscription.
			</Dialog.Description>
		</Dialog.Header>
		<form onsubmit={handleSubmit} class="space-y-4">
			<div class="space-y-2">
				<Label for="organization-name">Name</Label>
				<Input
					id="organization-name"
					bind:value={name}
					placeholder="Acme Inc."
					required
					disabled={isSubmitting}
				/>
			</div>
			<div class="space-y-2">
				<Label for="organization-slug">Slug</Label>
				<Input
					id="organization-slug"
					bind:value={slug}
					oninput={() => (slugEdited = true)}
					placeholder="acme-inc"
					pattern="[a-z0-9]+(-[a-z0-9]+)*"
					required
					disabled={isSubmitting}
					aria-invalid={slugTaken}
				/>
				{#if slugTaken}
					<p class="text-sm text-destructive">This slug is already taken.</p>
				{:else}
					<p class="text-sm text-muted-foreground">
						Used in URLs and must be unique. Lowercase letters, numbers, and dashes only.
					</p>
				{/if}
			</div>
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={!name.trim() || !slug || slugTaken || isSubmitting}>
					{isSubmitting ? 'Creating...' : 'Create organization'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
