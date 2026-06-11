<script lang="ts">
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import { showErrorToast } from '$lib/toast.js';
	import { authClient } from '$lib/auth-client.js';
	import { isPersonalOrganization } from '$lib/organizations.js';
	import type { ActiveOrganization } from './types';

	interface Props {
		organization: ActiveOrganization;
	}

	let { organization }: Props = $props();

	let confirmAction = $state<'leave' | 'delete' | null>(null);
	let isProcessing = $state(false);

	let isPersonal = $derived(isPersonalOrganization(organization));
	let isOwner = $derived(organization.currentMemberRole === 'owner');

	// Fall back to another organization (e.g. the personal workspace) after
	// leaving or deleting the active one, so there's always an active org.
	async function activateFallbackOrganization() {
		const { data: organizations } = await authClient.organization.list();
		const fallback = organizations?.find((candidate) => candidate.id !== organization.id);
		if (fallback) {
			await authClient.organization.setActive({ organizationId: fallback.id });
		}
	}

	async function handleConfirm() {
		if (!confirmAction || isProcessing) return;
		isProcessing = true;
		try {
			if (confirmAction === 'leave') {
				const { error } = await authClient.organization.leave({
					organizationId: organization.id
				});
				if (error) throw new Error(error.message);
				toast.success(`You left ${organization.name}`);
			} else {
				const { error } = await authClient.organization.delete({
					organizationId: organization.id
				});
				if (error) throw new Error(error.message);
				toast.success(`${organization.name} deleted`);
			}
			confirmAction = null;
			await activateFallbackOrganization();
			await invalidateAll();
			goto(resolve('/dashboard'));
		} catch (error) {
			showErrorToast(error, `Failed to ${confirmAction} organization`);
		} finally {
			isProcessing = false;
		}
	}
</script>

{#if !isPersonal && (isOwner || organization.currentMemberRole)}
	<Card.Root class="border-destructive/50">
		<Card.Header>
			<Card.Title>Danger Zone</Card.Title>
			<Card.Description>Irreversible actions for this organization.</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4">
			{#if !isOwner}
				<div class="flex items-center justify-between gap-4">
					<div>
						<p class="text-sm font-medium">Leave organization</p>
						<p class="text-sm text-muted-foreground">
							You will lose access to this organization and its data.
						</p>
					</div>
					<Button variant="destructive" onclick={() => (confirmAction = 'leave')}>Leave</Button>
				</div>
			{:else}
				<div class="flex items-center justify-between gap-4">
					<div>
						<p class="text-sm font-medium">Delete organization</p>
						<p class="text-sm text-muted-foreground">
							Permanently delete this organization, its members, and its subscription.
						</p>
					</div>
					<Button variant="destructive" onclick={() => (confirmAction = 'delete')}>Delete</Button>
				</div>
			{/if}
		</Card.Content>
	</Card.Root>
{/if}

<AlertDialog.Root
	open={confirmAction !== null}
	onOpenChange={(open) => {
		if (!open) confirmAction = null;
	}}
>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>
				{confirmAction === 'leave' ? 'Leave organization?' : 'Delete organization?'}
			</AlertDialog.Title>
			<AlertDialog.Description>
				{#if confirmAction === 'leave'}
					You will lose access to {organization.name}. An owner or admin will need to invite you
					again to rejoin.
				{:else}
					This permanently deletes {organization.name} and removes all of its members. This action cannot
					be undone.
				{/if}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={isProcessing}>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action onclick={handleConfirm} disabled={isProcessing}>
				{#if isProcessing}
					Processing...
				{:else}
					{confirmAction === 'leave' ? 'Leave' : 'Delete'}
				{/if}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
