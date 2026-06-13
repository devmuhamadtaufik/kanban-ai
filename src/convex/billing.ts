import { action, internalAction } from './_generated/server';
import { ConvexError, v } from 'convex/values';
import { type GenericCtx } from '@convex-dev/better-auth';
import { type DataModel } from './_generated/dataModel';
import { type Autumn } from 'autumn-js';
import { isCustomerNotFound, requireAutumn, toBillingError, type BillingError } from './autumn';
import { resolveActiveOrganization } from './organizations';
import { canManageOrganization } from '../lib/organizations';

// Ensure SITE_URL is set for Better Auth
if (!process.env.SITE_URL && process.env.BETTER_AUTH_URL) {
	process.env.SITE_URL = process.env.BETTER_AUTH_URL;
}

/**
 * Billing is scoped to the active organization, not the user. Every user
 * gets a personal organization on sign-up, so this works unchanged for
 * B2C (personal org = the customer) and B2B (shared org = the customer).
 * The organization id is the Autumn customer id.
 */
async function identifyBillingCustomer(ctx: GenericCtx<DataModel>) {
	try {
		const resolved = await resolveActiveOrganization(ctx);
		if (!resolved) return null;
		return {
			customerId: resolved.organization.id,
			name: resolved.organization.name,
			// Billing contact: the member currently acting on behalf of the org
			email: resolved.session.user.email
		};
	} catch {
		// User is not authenticated
		return null;
	}
}

/**
 * Subscription-mutating operations are restricted to owners and admins;
 * regular members can view billing state but not change it.
 */
async function requireBillingManager(ctx: GenericCtx<DataModel>) {
	const resolved = await resolveActiveOrganization(ctx);
	if (!resolved) {
		throw new ConvexError('No active organization');
	}
	if (!canManageOrganization(resolved.currentMemberRole)) {
		throw new ConvexError('Only organization owners and admins can manage billing');
	}
	return {
		customerId: resolved.organization.id,
		name: resolved.organization.name,
		email: resolved.session.user.email
	};
}

const billingErrorValidator = v.union(
	v.null(),
	v.object({ message: v.string(), code: v.string() })
);
const billingResultValidator = v.object({ data: v.any(), error: billingErrorValidator });

const noOrganizationError: BillingError = {
	message: 'No active organization',
	code: 'no_organization'
};

// Run an Autumn call, provisioning the organization's customer and retrying
// once if it doesn't exist yet. Customers are provisioned when the
// organization is created (see auth.ts), but that hook only logs failures —
// this is the recovery path that keeps billing self-healing afterwards.
async function withCustomerRecovery<T>(
	autumn: Autumn,
	customer: { customerId: string; name: string; email: string },
	fn: () => Promise<T>
): Promise<T> {
	try {
		return await fn();
	} catch (error) {
		if (!isCustomerNotFound(error)) throw error;
		await autumn.customers.getOrCreate({
			customerId: customer.customerId,
			name: customer.name,
			email: customer.email
		});
		return await fn();
	}
}

// List available plans with pricing and feature items. Public: unauthenticated
// users can view the pricing page.
export const listPlans = action({
	args: {},
	returns: billingResultValidator,
	handler: async () => {
		try {
			const autumn = requireAutumn();
			const { list } = await autumn.plans.list();
			return { data: { list }, error: null };
		} catch (error) {
			console.error('Error listing plans:', error);
			return { data: null, error: toBillingError(error) };
		}
	}
});

// Get customer subscription state for the active organization. Readable by
// any member. `getOrCreate` provisions the customer (and its auto-enabled
// free plan) if the creation hook in auth.ts failed.
export const getCustomer = action({
	args: {},
	returns: billingResultValidator,
	handler: async (ctx) => {
		const customer = await identifyBillingCustomer(ctx);
		if (!customer) return { data: null, error: noOrganizationError };

		try {
			const autumn = requireAutumn();
			const data = await autumn.customers.getOrCreate({
				customerId: customer.customerId,
				name: customer.name,
				email: customer.email
			});
			return { data, error: null };
		} catch (error) {
			console.error('Error getting customer:', error);
			return { data: null, error: toBillingError(error) };
		}
	}
});

// Attach a plan to the active organization (new subscription, upgrade or
// downgrade). Returns `paymentUrl` when the customer must complete payment
// through Stripe checkout; plan changes that need no payment input apply
// immediately and return a null `paymentUrl`.
export const attach = action({
	args: { planId: v.string() },
	returns: billingResultValidator,
	handler: async (ctx, args) => {
		const customer = await requireBillingManager(ctx);
		try {
			const autumn = requireAutumn();
			const data = await withCustomerRecovery(autumn, customer, () =>
				autumn.billing.attach({
					customerId: customer.customerId,
					planId: args.planId,
					redirectMode: 'if_required'
				})
			);
			return { data, error: null };
		} catch (error) {
			console.error('Error attaching plan:', error);
			return { data: null, error: toBillingError(error) };
		}
	}
});

// Stripe billing portal for the active organization (payment methods,
// invoices, cancellation).
export const billingPortal = action({
	args: {},
	returns: billingResultValidator,
	handler: async (ctx) => {
		const customer = await requireBillingManager(ctx);
		try {
			const autumn = requireAutumn();
			const data = await withCustomerRecovery(autumn, customer, () =>
				autumn.billing.openCustomerPortal({
					customerId: customer.customerId
				})
			);
			return { data, error: null };
		} catch (error) {
			console.error('Error opening billing portal:', error);
			return { data: null, error: toBillingError(error) };
		}
	}
});

// Check whether the active organization has balance left for a feature.
// Member-safe and strictly read-only — usage is only ever recorded through
// the internal `track` below.
export const check = action({
	args: {
		featureId: v.string(),
		requiredBalance: v.optional(v.number())
	},
	returns: billingResultValidator,
	handler: async (ctx, args) => {
		const customer = await identifyBillingCustomer(ctx);
		if (!customer) return { data: null, error: noOrganizationError };

		try {
			const autumn = requireAutumn();
			const data = await withCustomerRecovery(autumn, customer, () =>
				autumn.check({
					customerId: customer.customerId,
					featureId: args.featureId,
					requiredBalance: args.requiredBalance
				})
			);
			return { data, error: null };
		} catch (error) {
			console.error('Error checking feature access:', error);
			return { data: null, error: toBillingError(error) };
		}
	}
});

// Record usage of a feature for the active organization. Internal only: call
// it from trusted server-side code (`ctx.runAction(internal.billing.track,
// ...)`) after the feature action actually happened. Exposing it to clients
// would let any member consume — or, with negative values, mint — the
// organization's balance directly.
export const track = internalAction({
	args: {
		featureId: v.string(),
		value: v.optional(v.number())
	},
	returns: billingResultValidator,
	handler: async (ctx, args) => {
		const customer = await identifyBillingCustomer(ctx);
		if (!customer) return { data: null, error: noOrganizationError };

		try {
			const autumn = requireAutumn();
			const data = await withCustomerRecovery(autumn, customer, () =>
				autumn.track({
					customerId: customer.customerId,
					featureId: args.featureId,
					value: args.value
				})
			);
			return { data, error: null };
		} catch (error) {
			console.error('Error tracking usage:', error);
			return { data: null, error: toBillingError(error) };
		}
	}
});
