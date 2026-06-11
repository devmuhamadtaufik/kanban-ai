<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import MailPlusIcon from '@lucide/svelte/icons/mail-plus';
	import XIcon from '@lucide/svelte/icons/x';
	import { toast } from 'svelte-sonner';
	import { showErrorToast } from '$lib/toast.js';
	import { authClient } from '$lib/auth-client.js';
	import type { ActiveOrganization, OrganizationInvitation } from './types';

	interface Props {
		organization: ActiveOrganization;
	}

	let { organization }: Props = $props();

	let inviteDialogOpen = $state(false);
	let inviteEmail = $state('');
	let inviteRole = $state<'member' | 'admin'>('member');
	let isInviting = $state(false);

	const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

	async function handleInvite(e: Event) {
		e.preventDefault();
		if (!inviteEmail.trim() || isInviting) return;
		isInviting = true;
		try {
			const { error } = await authClient.organization.inviteMember({
				email: inviteEmail.trim(),
				role: inviteRole,
				organizationId: organization.id
			});
			if (error) throw new Error(error.message);
			toast.success(`Invitation sent to ${inviteEmail.trim()}`);
			inviteDialogOpen = false;
			inviteEmail = '';
			inviteRole = 'member';
		} catch (error) {
			showErrorToast(error, 'Failed to send invitation');
		} finally {
			isInviting = false;
		}
	}

	async function handleCancel(invitation: OrganizationInvitation) {
		try {
			const { error } = await authClient.organization.cancelInvitation({
				invitationId: invitation.id
			});
			if (error) throw new Error(error.message);
			toast.success(`Invitation to ${invitation.email} cancelled`);
		} catch (error) {
			showErrorToast(error, 'Failed to cancel invitation');
		}
	}
</script>

<Card.Root>
	<Card.Header class="flex flex-row items-start justify-between space-y-0">
		<div class="space-y-1.5">
			<Card.Title>Pending Invitations</Card.Title>
			<Card.Description>Invite teammates to join this organization.</Card.Description>
		</div>
		<Button onclick={() => (inviteDialogOpen = true)}>
			<MailPlusIcon class="size-4" />
			Invite member
		</Button>
	</Card.Header>
	<Card.Content>
		{#if organization.invitations.length === 0}
			<p class="text-sm text-muted-foreground">No pending invitations.</p>
		{:else}
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Email</Table.Head>
						<Table.Head>Role</Table.Head>
						<Table.Head>Expires</Table.Head>
						<Table.Head class="w-12"><span class="sr-only">Actions</span></Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each organization.invitations as invitation (invitation.id)}
						<Table.Row>
							<Table.Cell class="font-medium">{invitation.email}</Table.Cell>
							<Table.Cell>
								<Badge variant="secondary" class="capitalize">{invitation.role ?? 'member'}</Badge>
							</Table.Cell>
							<Table.Cell class="text-muted-foreground">
								{dateFormatter.format(invitation.expiresAt)}
							</Table.Cell>
							<Table.Cell>
								<Button
									variant="ghost"
									size="icon"
									onclick={() => handleCancel(invitation)}
									aria-label="Cancel invitation"
								>
									<XIcon class="size-4" />
								</Button>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{/if}
	</Card.Content>
</Card.Root>

<Dialog.Root bind:open={inviteDialogOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Invite member</Dialog.Title>
			<Dialog.Description>
				They'll receive an email with a link to join {organization.name}.
			</Dialog.Description>
		</Dialog.Header>
		<form onsubmit={handleInvite} class="space-y-4">
			<div class="space-y-2">
				<Label for="invite-email">Email</Label>
				<Input
					id="invite-email"
					type="email"
					bind:value={inviteEmail}
					placeholder="teammate@example.com"
					required
					disabled={isInviting}
				/>
			</div>
			<div class="space-y-2">
				<Label for="invite-role">Role</Label>
				<Select.Root type="single" bind:value={inviteRole}>
					<Select.Trigger id="invite-role" class="w-full capitalize">
						{inviteRole}
					</Select.Trigger>
					<Select.Content>
						<Select.Item value="member" label="member">member</Select.Item>
						<Select.Item value="admin" label="admin">admin</Select.Item>
					</Select.Content>
				</Select.Root>
				<p class="text-sm text-muted-foreground">
					Admins can manage members and invitations. Members have read-only access to the
					organization.
				</p>
			</div>
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (inviteDialogOpen = false)}>
					Cancel
				</Button>
				<Button type="submit" disabled={!inviteEmail.trim() || isInviting}>
					{isInviting ? 'Sending...' : 'Send invitation'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
