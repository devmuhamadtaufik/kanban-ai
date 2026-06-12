import { action, query } from './_generated/server';
import { ConvexError, v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import { Autumn } from 'autumn-js';
import { type DataModel } from './_generated/dataModel';
import { type GenericCtx } from '@convex-dev/better-auth';
import { authComponent } from './auth';
import { findMany, findOne } from './authAdapter';

/**
 * Admin-only queries over Better Auth's organization tables.
 *
 * The Better Auth organization plugin has no cross-organization admin API —
 * all of its endpoints are membership-scoped — so these queries read the
 * component tables directly through the local-install adapter, gated on the
 * admin plugin's `role` field. For interventions inside an organization
 * (rename, remove members, manage billing), admins impersonate the owner
 * from /admin/users and use the regular org UI instead.
 */

async function requireAdmin(ctx: GenericCtx<DataModel>) {
	const user = await authComponent.safeGetAuthUser(ctx);
	if (!user || user.role !== 'admin') {
		throw new ConvexError('Admin access required');
	}
	return user;
}

const organizationSummaryValidator = v.object({
	id: v.string(),
	name: v.string(),
	slug: v.string(),
	logo: v.union(v.null(), v.string()),
	metadata: v.any(),
	createdAt: v.number(),
	memberCount: v.number(),
	owner: v.union(v.null(), v.object({ name: v.string(), email: v.string() }))
});

export const listOrganizations = query({
	args: {
		paginationOpts: paginationOptsValidator,
		search: v.optional(v.string())
	},
	returns: v.object({
		page: v.array(organizationSummaryValidator),
		isDone: v.boolean(),
		continueCursor: v.string()
	}),
	handler: async (ctx, args) => {
		await requireAdmin(ctx);
		// The Convex adapter doesn't support case-insensitive `contains`, so
		// search scans a bounded window (most recent 500 organizations) and
		// filters here instead of using cursor pagination.
		const search = args.search?.trim().toLowerCase();
		const result = await findMany(ctx, {
			model: 'organization',
			paginationOpts: search
				? { numItems: 500, cursor: null }
				: { numItems: args.paginationOpts.numItems, cursor: args.paginationOpts.cursor },
			sortBy: { field: 'createdAt', direction: 'desc' }
		});
		const matches = search
			? // eslint-disable-next-line @typescript-eslint/no-explicit-any
				result.page.filter((organization: any) =>
					`${organization.name} ${organization.slug}`.toLowerCase().includes(search)
				)
			: result.page;

		const page = await Promise.all(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			matches.slice(0, args.paginationOpts.numItems).map(async (organization: any) => {
				const members = await findMany(ctx, {
					model: 'member',
					where: [{ field: 'organizationId', value: String(organization._id) }],
					paginationOpts: { numItems: 1000, cursor: null }
				});
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const ownerMember = members.page.find((member: any) => member.role === 'owner');
				const owner = ownerMember
					? await findOne(ctx, {
							model: 'user',
							where: [{ field: '_id', value: String(ownerMember.userId) }]
						})
					: null;
				return {
					id: String(organization._id),
					name: organization.name as string,
					slug: organization.slug as string,
					logo: (organization.logo ?? null) as string | null,
					metadata: organization.metadata ?? null,
					createdAt: organization.createdAt as number,
					memberCount: members.page.length,
					owner: owner ? { name: String(owner.name), email: String(owner.email) } : null
				};
			})
		);

		return {
			page,
			// Search results are a single page; browsing paginates normally
			isDone: search ? true : result.isDone,
			continueCursor: search ? '' : result.continueCursor
		};
	}
});

export const getOrganization = query({
	args: { organizationId: v.string() },
	returns: v.union(
		v.null(),
		v.object({
			id: v.string(),
			name: v.string(),
			slug: v.string(),
			logo: v.union(v.null(), v.string()),
			metadata: v.any(),
			createdAt: v.number(),
			members: v.array(
				v.object({
					id: v.string(),
					role: v.string(),
					createdAt: v.number(),
					user: v.object({
						name: v.string(),
						email: v.string(),
						image: v.union(v.null(), v.string())
					})
				})
			),
			invitations: v.array(
				v.object({
					id: v.string(),
					email: v.string(),
					role: v.union(v.null(), v.string()),
					status: v.string(),
					expiresAt: v.number()
				})
			)
		})
	),
	handler: async (ctx, args) => {
		await requireAdmin(ctx);
		const organization = await findOne(ctx, {
			model: 'organization',
			where: [{ field: '_id', value: args.organizationId }]
		});
		if (!organization) return null;

		const members = await findMany(ctx, {
			model: 'member',
			where: [{ field: 'organizationId', value: args.organizationId }],
			paginationOpts: { numItems: 1000, cursor: null }
		});
		const invitations = await findMany(ctx, {
			model: 'invitation',
			where: [
				{ field: 'organizationId', value: args.organizationId },
				{ field: 'status', value: 'pending' }
			],
			paginationOpts: { numItems: 200, cursor: null }
		});

		return {
			id: String(organization._id),
			name: String(organization.name),
			slug: String(organization.slug),
			logo: (organization.logo ?? null) as string | null,
			metadata: organization.metadata ?? null,
			createdAt: organization.createdAt as number,
			members: await Promise.all(
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				members.page.map(async (member: any) => {
					const user = await findOne(ctx, {
						model: 'user',
						where: [{ field: '_id', value: String(member.userId) }]
					});
					return {
						id: String(member._id),
						role: String(member.role),
						createdAt: member.createdAt as number,
						user: {
							name: String(user?.name ?? 'Unknown'),
							email: String(user?.email ?? ''),
							image: (user?.image ?? null) as string | null
						}
					};
				})
			),
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			invitations: invitations.page.map((invitation: any) => ({
				id: String(invitation._id),
				email: String(invitation.email),
				role: (invitation.role ?? null) as string | null,
				status: String(invitation.status),
				expiresAt: invitation.expiresAt as number
			}))
		};
	}
});

// Billing state for any organization (admin-only). Uses the Autumn SDK
// directly because the Autumn component's identify hook is scoped to the
// caller's own active organization.
export const getOrganizationBilling = action({
	args: { organizationId: v.string() },
	returns: v.object({
		data: v.any(),
		error: v.union(v.null(), v.object({ message: v.string(), code: v.string() }))
	}),
	handler: async (ctx, args) => {
		await requireAdmin(ctx);
		const autumn = new Autumn({ secretKey: process.env.AUTUMN_SECRET_KEY ?? '' });
		const { data, error } = await autumn.customers.get(args.organizationId);
		if (error && error.code !== 'customer_not_found') {
			return { data: null, error: { message: error.message, code: error.code } };
		}
		return { data: data ?? null, error: null };
	}
});
