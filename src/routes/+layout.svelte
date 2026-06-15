<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { createSvelteAuthClient } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { authClient } from '$lib/auth-client';
	import { Toaster } from '$lib/components/ui/sonner/index.js';
	createSvelteAuthClient({ authClient });

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<Toaster />
{@render children?.()}
