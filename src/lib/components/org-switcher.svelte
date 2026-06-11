<script lang="ts">
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { useSidebar } from '$lib/components/ui/sidebar/index.js';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { invalidateAll } from '$app/navigation';
	import { showErrorToast } from '$lib/toast.js';
	import { authClient } from '$lib/auth-client.js';
	import { isPersonalOrganization } from '$lib/organizations.js';
	import CreateOrganizationDialog from './create-organization-dialog.svelte';

	const sidebar = useSidebar();
	const organizations = authClient.useListOrganizations();
	const activeOrganization = authClient.useActiveOrganization();

	let createDialogOpen = $state(false);
	let isSwitching = $state(false);

	async function switchOrganization(organizationId: string) {
		if (organizationId === $activeOrganization.data?.id || isSwitching) return;
		isSwitching = true;
		try {
			const { error } = await authClient.organization.setActive({ organizationId });
			if (error) throw new Error(error.message);
			// Refresh server-loaded data (e.g. billing) for the new organization
			await invalidateAll();
		} catch (error) {
			showErrorToast(error, 'Failed to switch organization');
		} finally {
			isSwitching = false;
		}
	}
</script>

<Sidebar.Menu>
	<Sidebar.MenuItem>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Sidebar.MenuButton
						{...props}
						size="lg"
						class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
					>
						<Avatar.Root class="size-8 rounded-lg">
							{#if $activeOrganization.data?.logo}
								<Avatar.Image
									src={$activeOrganization.data.logo}
									alt={$activeOrganization.data.name}
								/>
							{/if}
							<Avatar.Fallback
								class="rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"
							>
								{$activeOrganization.data?.name?.charAt(0).toUpperCase() ?? '?'}
							</Avatar.Fallback>
						</Avatar.Root>
						<div class="grid flex-1 text-left text-sm leading-tight">
							<span class="truncate font-medium">
								{$activeOrganization.data?.name ?? 'Select organization'}
							</span>
							<span class="truncate text-xs text-muted-foreground">
								{#if $activeOrganization.data}
									{isPersonalOrganization($activeOrganization.data)
										? 'Personal workspace'
										: `${$activeOrganization.data.members?.length ?? 1} member${($activeOrganization.data.members?.length ?? 1) === 1 ? '' : 's'}`}
								{/if}
							</span>
						</div>
						<ChevronsUpDownIcon class="ml-auto" />
					</Sidebar.MenuButton>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content
				class="w-(--bits-dropdown-menu-anchor-width) min-w-56 rounded-lg"
				align="start"
				side={sidebar.isMobile ? 'bottom' : 'right'}
				sideOffset={4}
			>
				<DropdownMenu.Label class="text-xs text-muted-foreground">Organizations</DropdownMenu.Label>
				{#each $organizations.data ?? [] as organization (organization.id)}
					<DropdownMenu.Item onSelect={() => switchOrganization(organization.id)} class="gap-2 p-2">
						<Avatar.Root class="size-6 rounded-md border">
							{#if organization.logo}
								<Avatar.Image src={organization.logo} alt={organization.name} />
							{/if}
							<Avatar.Fallback class="rounded-md text-xs">
								{organization.name.charAt(0).toUpperCase()}
							</Avatar.Fallback>
						</Avatar.Root>
						<span class="truncate">{organization.name}</span>
						{#if organization.id === $activeOrganization.data?.id}
							<CheckIcon class="ml-auto size-4" />
						{/if}
					</DropdownMenu.Item>
				{/each}
				<DropdownMenu.Separator />
				<DropdownMenu.Item class="gap-2 p-2" onSelect={() => (createDialogOpen = true)}>
					<div class="flex size-6 items-center justify-center rounded-md border bg-transparent">
						<PlusIcon class="size-4" />
					</div>
					<div class="font-medium text-muted-foreground">Create organization</div>
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</Sidebar.MenuItem>
</Sidebar.Menu>

<CreateOrganizationDialog bind:open={createDialogOpen} />
