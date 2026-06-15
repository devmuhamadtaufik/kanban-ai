import { createConvexHttpClient } from '@mmailaender/convex-better-auth-svelte/sveltekit';
import { api } from '$convex/_generated/api';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Pass the auth token explicitly. The no-arg form relies on an
	// AsyncLocalStorage lookup that doesn't see the token set by the SvelteKit
	// hook, so `getCustomer` would run unauthenticated and always report no
	// active organization. (Same pattern as the admin layout load.)
	const client = createConvexHttpClient({ token: locals.token });

	try {
		// Fetch plans and customer data in parallel
		const [plansResult, customerResult] = await Promise.all([
			client.action(api.billing.listPlans, {}),
			client.action(api.billing.getCustomer, {})
		]);

		// Surface billing failures instead of rendering them as an empty plan
		// list ("no_organization" just means no customer to show yet).
		const billingError = [plansResult?.error, customerResult?.error].find(
			(error) => error && error.code !== 'no_organization'
		);

		return {
			plans: plansResult?.data?.list || [],
			customerData: customerResult || null,
			billingError: billingError?.message ?? null
		};
	} catch (error) {
		console.error('Error loading billing data:', error);
		return {
			plans: [],
			customerData: null,
			billingError: 'Failed to load billing data'
		};
	}
};
