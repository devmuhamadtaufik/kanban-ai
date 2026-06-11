import { components } from './_generated/api';
import { Autumn } from '@useautumn/convex';
import { resolveActiveOrganization } from './organizations';

export const autumn = new Autumn(components.autumn, {
	secretKey: process.env.AUTUMN_SECRET_KEY ?? '',
	// Billing is scoped to the active organization, not the user. Every user
	// gets a personal organization on sign-up, so this works unchanged for
	// B2C (personal org = the customer) and B2B (shared org = the customer).
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	identify: async (ctx: any) => {
		try {
			const resolved = await resolveActiveOrganization(ctx);
			if (!resolved) return null;

			return {
				customerId: resolved.organization.id,
				customerData: {
					name: resolved.organization.name,
					// Billing contact: the member currently acting on behalf of the org
					email: resolved.session.user.email
				}
			};
		} catch {
			// User is not authenticated, return null
			return null;
		}
	}
});

// Only member-safe operations are exposed as public Convex functions.
// Subscription-mutating operations (checkout, attach, cancel, billing portal,
// …) go through `billing.ts`, which checks the caller's organization role via
// the Autumn instance methods (e.g. `autumn.checkout(ctx, args)`).
export const { track, check, usage, query, listProducts } = autumn.api();
