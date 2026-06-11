<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { toast } from 'svelte-sonner';
	import { showErrorToast } from '$lib/toast.js';
	import { authClient } from '$lib/auth-client.js';
	import { siteConfig } from '$lib/config.js';

	interface InvitationDetails {
		id: string;
		email: string;
		role: string;
		status: string;
		organizationId: string;
		organizationName: string;
		inviterEmail: string;
		expiresAt: Date | string;
	}

	const auth = useAuth();
	const invitationId = $derived(page.params.id);

	let invitation = $state<InvitationDetails | null>(null);
	let loadError = $state<string | null>(null);
	let isLoadingInvitation = $state(true);
	let isResponding = $state(false);
	let requestedInvitationId = $state<string | null>(null);

	// The invitation can only be read by the invited user, so load it once
	// the visitor is signed in. Guarded by the requested id so auth-state
	// changes don't trigger duplicate fetches for the same invitation.
	$effect(() => {
		if (auth.isLoading || !auth.isAuthenticated || !invitationId) return;
		if (requestedInvitationId === invitationId) return;
		const requestId = invitationId;
		requestedInvitationId = requestId;
		isLoadingInvitation = true;
		loadError = null;
		invitation = null;
		authClient.organization.getInvitation({ query: { id: requestId } }).then(({ data, error }) => {
			// Drop the response if a newer invitation id was requested meanwhile
			if (requestedInvitationId !== requestId) return;
			if (error) {
				loadError = error.message ?? 'This invitation is invalid or has expired.';
			} else {
				invitation = data;
			}
			isLoadingInvitation = false;
		});
	});

	async function handleAccept() {
		if (!invitation || isResponding) return;
		isResponding = true;
		try {
			const { error } = await authClient.organization.acceptInvitation({
				invitationId: invitation.id
			});
			if (error) throw new Error(error.message);
			await authClient.organization.setActive({ organizationId: invitation.organizationId });
			await invalidateAll();
			toast.success(`Welcome to ${invitation.organizationName}!`);
			goto(resolve('/dashboard'));
		} catch (error) {
			showErrorToast(error, 'Failed to accept invitation');
			isResponding = false;
		}
	}

	async function handleReject() {
		if (!invitation || isResponding) return;
		isResponding = true;
		try {
			const { error } = await authClient.organization.rejectInvitation({
				invitationId: invitation.id
			});
			if (error) throw new Error(error.message);
			toast.success('Invitation declined');
			goto(resolve('/'));
		} catch (error) {
			showErrorToast(error, 'Failed to decline invitation');
			isResponding = false;
		}
	}
</script>

<svelte:head>
	<title>Accept Invitation | {siteConfig.name}</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center p-4">
	{#if auth.isLoading}
		<Skeleton class="h-64 w-full max-w-md" />
	{:else if !auth.isAuthenticated}
		<Card.Root class="w-full max-w-md">
			<Card.Header>
				<Card.Title>You've been invited</Card.Title>
				<Card.Description>
					Sign in or create an account with the email this invitation was sent to.
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-3">
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<Button href={`${resolve('/auth/sign-in')}?redirect=/accept-invitation/${invitationId}`}>
					Sign in
				</Button>
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<Button
					variant="outline"
					href={`${resolve('/auth/sign-up')}?redirect=/accept-invitation/${invitationId}`}
				>
					Create an account
				</Button>
			</Card.Content>
		</Card.Root>
	{:else if isLoadingInvitation}
		<Skeleton class="h-64 w-full max-w-md" />
	{:else if loadError || !invitation}
		<Card.Root class="w-full max-w-md">
			<Card.Header>
				<Card.Title>Invitation unavailable</Card.Title>
				<Card.Description>
					{loadError ??
						'This invitation is invalid or has expired. Make sure you are signed in with the email the invitation was sent to.'}
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<Button href={resolve('/dashboard')} variant="outline" class="w-full">
					Go to dashboard
				</Button>
			</Card.Content>
		</Card.Root>
	{:else if invitation.status !== 'pending'}
		<Card.Root class="w-full max-w-md">
			<Card.Header>
				<Card.Title>Invitation already {invitation.status}</Card.Title>
				<Card.Description>This invitation has already been {invitation.status}.</Card.Description>
			</Card.Header>
			<Card.Content>
				<Button href={resolve('/dashboard')} variant="outline" class="w-full">
					Go to dashboard
				</Button>
			</Card.Content>
		</Card.Root>
	{:else}
		<Card.Root class="w-full max-w-md">
			<Card.Header>
				<Card.Title>Join {invitation.organizationName}</Card.Title>
				<Card.Description>
					{invitation.inviterEmail} invited you to join
					<strong>{invitation.organizationName}</strong>
					as {invitation.role === 'admin' ? 'an' : 'a'}
					{invitation.role}.
				</Card.Description>
			</Card.Header>
			<Card.Footer class="flex gap-3">
				<Button variant="outline" class="flex-1" onclick={handleReject} disabled={isResponding}>
					Decline
				</Button>
				<Button class="flex-1" onclick={handleAccept} disabled={isResponding}>
					{isResponding ? 'Joining...' : 'Accept invitation'}
				</Button>
			</Card.Footer>
		</Card.Root>
	{/if}
</div>
