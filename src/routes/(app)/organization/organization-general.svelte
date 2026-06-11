<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { toast } from 'svelte-sonner';
	import { showErrorToast } from '$lib/toast.js';
	import { authClient } from '$lib/auth-client.js';
	import { isPersonalOrganization } from '$lib/organizations.js';
	import type { ActiveOrganization } from './types';

	interface Props {
		organization: ActiveOrganization;
		canManage: boolean;
	}

	let { organization, canManage }: Props = $props();

	// Writable derived: editable in the form, resets when the active organization changes
	let name = $derived(organization.name);
	let isLoading = $state(false);

	async function handleUpdate(e: Event) {
		e.preventDefault();
		if (!name.trim() || isLoading) return;
		isLoading = true;
		try {
			const { error } = await authClient.organization.update({
				organizationId: organization.id,
				data: { name: name.trim() }
			});
			if (error) throw new Error(error.message);
			toast.success('Organization updated');
		} catch (error) {
			showErrorToast(error, 'Failed to update organization');
		} finally {
			isLoading = false;
		}
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title class="flex items-center gap-2">
			General
			{#if isPersonalOrganization(organization)}
				<Badge variant="secondary">Personal workspace</Badge>
			{/if}
		</Card.Title>
		<Card.Description>Your organization's name and identifier.</Card.Description>
	</Card.Header>
	<Card.Content>
		<form onsubmit={handleUpdate} class="space-y-4">
			<div class="space-y-2">
				<Label for="organization-name">Name</Label>
				<Input
					id="organization-name"
					bind:value={name}
					placeholder="Organization name"
					required
					disabled={!canManage || isLoading}
				/>
			</div>
			<div class="space-y-2">
				<Label for="organization-slug">Slug</Label>
				<Input id="organization-slug" value={organization.slug} readonly disabled />
				<p class="text-sm text-muted-foreground">The unique identifier for your organization.</p>
			</div>
			{#if canManage}
				<Button type="submit" disabled={isLoading || name.trim() === organization.name}>
					{isLoading ? 'Saving...' : 'Save Changes'}
				</Button>
			{/if}
		</form>
	</Card.Content>
</Card.Root>
