<script lang="ts">
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { toast } from 'svelte-sonner';
	import { showErrorToast } from '$lib/toast.js';
	import { authClient } from '$lib/auth-client.js';
	import { organizationRoles, type OrganizationRole } from '$lib/organizations.js';
	import type { ActiveOrganization, OrganizationMember } from './types';

	interface Props {
		organization: ActiveOrganization;
		canManage: boolean;
	}

	let { organization, canManage }: Props = $props();

	let memberToRemove = $state<OrganizationMember | null>(null);
	let isRemoving = $state(false);

	// Only owners can promote to / demote from the owner role
	let assignableRoles = $derived(
		organization.currentMemberRole === 'owner'
			? organizationRoles
			: organizationRoles.filter((role) => role !== 'owner')
	);

	function canEditMember(member: OrganizationMember): boolean {
		if (!canManage) return false;
		// Changing your own role (e.g. demoting the last owner) is done by
		// another owner; removing yourself is "Leave" in the danger zone.
		if (member.userId === organization.currentUserId) return false;
		if (member.role === 'owner' && organization.currentMemberRole !== 'owner') return false;
		return true;
	}

	async function handleRoleChange(member: OrganizationMember, role: string) {
		if (role === member.role) return;
		try {
			const { error } = await authClient.organization.updateMemberRole({
				memberId: member.id,
				role: role as OrganizationRole,
				organizationId: organization.id
			});
			if (error) throw new Error(error.message);
			toast.success(`${member.user.name || member.user.email} is now ${role}`);
		} catch (error) {
			showErrorToast(error, 'Failed to update role');
		}
	}

	async function handleRemove() {
		if (!memberToRemove || isRemoving) return;
		isRemoving = true;
		try {
			const { error } = await authClient.organization.removeMember({
				memberIdOrEmail: memberToRemove.id,
				organizationId: organization.id
			});
			if (error) throw new Error(error.message);
			toast.success(`${memberToRemove.user.name || memberToRemove.user.email} removed`);
			memberToRemove = null;
		} catch (error) {
			showErrorToast(error, 'Failed to remove member');
		} finally {
			isRemoving = false;
		}
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Members</Card.Title>
		<Card.Description>
			{organization.members.length} member{organization.members.length === 1 ? '' : 's'} in this organization.
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Member</Table.Head>
					<Table.Head>Role</Table.Head>
					<Table.Head class="w-12"><span class="sr-only">Actions</span></Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each organization.members as member (member.id)}
					<Table.Row>
						<Table.Cell>
							<div class="flex items-center gap-3">
								<Avatar.Root class="size-8">
									{#if member.user.image}
										<Avatar.Image src={member.user.image} alt={member.user.name} />
									{/if}
									<Avatar.Fallback class="text-xs">
										{(member.user.name || member.user.email).charAt(0).toUpperCase()}
									</Avatar.Fallback>
								</Avatar.Root>
								<div class="grid leading-tight">
									<span class="flex items-center gap-2 font-medium">
										{member.user.name || member.user.email}
										{#if member.userId === organization.currentUserId}
											<Badge variant="outline">You</Badge>
										{/if}
									</span>
									<span class="text-xs text-muted-foreground">{member.user.email}</span>
								</div>
							</div>
						</Table.Cell>
						<Table.Cell>
							{#if canEditMember(member)}
								<Select.Root
									type="single"
									value={member.role}
									onValueChange={(value) => {
										if (value) handleRoleChange(member, value);
									}}
								>
									<Select.Trigger class="w-[120px] capitalize">
										{member.role}
									</Select.Trigger>
									<Select.Content>
										{#each assignableRoles as role (role)}
											<Select.Item value={role} label={role} class="capitalize">
												{role}
											</Select.Item>
										{/each}
									</Select.Content>
								</Select.Root>
							{:else}
								<Badge variant="secondary" class="capitalize">{member.role}</Badge>
							{/if}
						</Table.Cell>
						<Table.Cell>
							{#if canEditMember(member)}
								<Button
									variant="ghost"
									size="icon"
									class="text-destructive hover:text-destructive"
									onclick={() => (memberToRemove = member)}
									aria-label="Remove member"
								>
									<Trash2Icon class="size-4" />
								</Button>
							{/if}
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</Card.Content>
</Card.Root>

<AlertDialog.Root
	open={memberToRemove !== null}
	onOpenChange={(open) => {
		if (!open) memberToRemove = null;
	}}
>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Remove member</AlertDialog.Title>
			<AlertDialog.Description>
				{memberToRemove?.user.name || memberToRemove?.user.email} will lose access to this organization.
				This action cannot be undone.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={isRemoving}>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action onclick={handleRemove} disabled={isRemoving}>
				{isRemoving ? 'Removing...' : 'Remove'}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
