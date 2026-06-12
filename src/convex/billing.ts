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

// Errors are returned as plain { message, code } values so the result is
// Convex-serializable and the UI can show them directly.
const billingErrorValidator = v.union(
	v.null(),
	v.object({ message: v.string(), code: v.string() })
);

// Get customer subscription data for the active organization. Readable by
// any member; a customer that doesn't exist yet (no checkout) is `null`.
export const getCustomer = action({
	args: {},
	returns: v.object({ data: v.any(), error: billingErrorValidator }),
	handler: async (ctx) => {
		const resolved = await resolveActiveOrganization(ctx);
		if (!resolved) {
			return { data: null, error: { message: 'No active organization', code: 'no_organization' } };
		}

		const { data, error } = await autumn.customers.get(ctx);
		if (error && error.code !== 'customer_not_found') {
			console.error('Error getting customer:', error);
			return { data: null, error: { message: error.message, code: error.code } };
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
	returns: v.object({ data: v.any(), error: billingErrorValidator }),
	handler: async (ctx, args) => {
		const resolved = await requireBillingManager(ctx);
		await ensureCustomer(ctx, resolved);
		const { data, error } = await autumn.checkout(ctx, { productId: args.productId });
		return {
			data: data ?? null,
			error: error ? { message: error.message, code: error.code } : null
		};
	}
});

// Billing portal for the active organization; creates the customer on first use
export const billingPortal = action({
	args: {},
	returns: v.object({ data: v.any(), error: billingErrorValidator }),
	handler: async (ctx) => {
		const resolved = await requireBillingManager(ctx);
		await ensureCustomer(ctx, resolved);
		const { data, error } = await autumn.customers.billingPortal(ctx, {});
		return {
			data: data ?? null,
			error: error ? { message: error.message, code: error.code } : null
		};
	}
});
