import { action } from './_generated/server';
import { ConvexError, v } from 'convex/values';
import { type GenericCtx } from '@convex-dev/better-auth';
import { type DataModel } from './_generated/dataModel';
import { autumn } from './autumn';
import { resolveActiveOrganization } from './organizations';
import { canManageOrganization } from '../lib/organizations';

// Ensure SITE_URL is set for Better Auth
if (!process.env.SITE_URL && process.env.BETTER_AUTH_URL) {
	process.env.SITE_URL = process.env.BETTER_AUTH_URL;
}

// Re-export listProducts as-is
export { listProducts } from './autumn';

/**
 * Billing is scoped to the active organization (see autumn.ts identify).
 * Subscription-mutating operations are restricted to owners and admins;
 * regular members can view billing state but not change it.
 */
async function requireBillingManager(ctx: GenericCtx<DataModel>) {
	const resolved = await resolveActiveOrganization(ctx);
	if (!resolved) {
		// ConvexError data reaches the client even in production (plain Error
		// messages are redacted), so the UI can show a meaningful toast.
		throw new ConvexError('No active organization');
	}
	if (!canManageOrganization(resolved.currentMemberRole)) {
		throw new ConvexError('Only organization owners and admins can manage billing');
	}
	return resolved;
}

// Get customer subscription data for the active organization. Readable by
// any member; a customer that doesn't exist yet (no checkout) is `null`.
export const getCustomer = action({
	args: {},
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	handler: async (ctx): Promise<any> => {
		const resolved = await resolveActiveOrganization(ctx);
		if (!resolved) {
			return { data: null, error: 'No active organization' };
		}

		const { data, error } = await autumn.customers.get(ctx);
		if (error && error.code !== 'customer_not_found') {
			console.error('Error getting customer:', error);
			return { data: null, error: error.message };
		}
		return { data: data ?? null, error: null };
	}
});

// Ensure the Autumn customer exists for the active organization (idempotent).
// Unlike the other Autumn instance methods, `customers.create` does not use
// the identify hook, so the organization's data is passed explicitly.
async function ensureCustomer(
	ctx: GenericCtx<DataModel>,
	resolved: NonNullable<Awaited<ReturnType<typeof resolveActiveOrganization>>>
) {
	const created = await autumn.customers.create(ctx, {
		id: resolved.organization.id,
		name: resolved.organization.name,
		email: resolved.session.user.email
	});
	if (created.error) {
		console.error('Failed to create Autumn customer:', created.error);
		throw new ConvexError(`Failed to prepare billing: ${created.error.message}`);
	}
}

// Checkout for the active organization; creates the customer on first use
export const checkout = action({
	args: { productId: v.string() },
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	handler: async (ctx, args): Promise<any> => {
		const resolved = await requireBillingManager(ctx);
		await ensureCustomer(ctx, resolved);
		return await autumn.checkout(ctx, { productId: args.productId });
	}
});

// Billing portal for the active organization; creates the customer on first use
export const billingPortal = action({
	args: {},
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	handler: async (ctx): Promise<any> => {
		const resolved = await requireBillingManager(ctx);
		await ensureCustomer(ctx, resolved);
		return await autumn.customers.billingPortal(ctx, {});
	}
});
