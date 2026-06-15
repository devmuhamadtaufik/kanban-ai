<script lang="ts">
	import LoginForm from '$lib/components/login-form.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { normalizeRedirect } from '$lib/utils.js';

	const auth = useAuth();

	// Optional post-auth destination (e.g. /accept-invitation/...). Only
	// same-origin paths are allowed to prevent open redirects.
	const redirectTo = $derived(normalizeRedirect(page.url.searchParams.get('redirect')));

	$effect(() => {
		if (!auth.isLoading && auth.isAuthenticated) {
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			goto(redirectTo);
		}
	});
</script>

<div class="flex min-h-screen items-center justify-center">
	<LoginForm mode="signup" {redirectTo} />
</div>
