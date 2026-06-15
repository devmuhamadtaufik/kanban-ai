import { query } from './_generated/server';
import { v } from 'convex/values';
import { type DataModel } from './_generated/dataModel';
import { type GenericCtx } from '@convex-dev/better-auth';
import { authComponent, createAuth } from './auth';
import { countOwnedOrganizations, findMany, findOne } from './authAdapter';

/**
 * Organization helpers built on the Better Auth organization plugin.
 *
 * Organization CRUD (create/update/delete, invitations, member roles) goes
 * through the Better Auth client (`authClient.organization.*`) on the
 * frontend. The queries here exist for what the client can't do well:
 * reactive, real-time reads of the active organization from Convex.
 *
 * Organization data is read directly from the component tables rather than
 * through `auth.api.getFullOrganization`: Better Auth's organization
 * endpoints attempt session refreshes, which are no-op writes in Convex
 * query context and make short-lived sessions (e.g. admin impersonation,
 * 1 hour) fail with UNAUTHORIZED.
 */

export interface ResolvedOrganization {
	id: string;
	name: string;
	slug: string;
	logo: string | null;
	metadata: unknown;
	createdAt: number;
	members: Array<{
		id: string;
		userId: string;
		role: string;
		createdAt: number;
		user: { name: string; email: string; image: string | null };
	}>;
	invitations: Array<{
		id: string;
		email: string;
		role: string | null;
		status: string;
		expiresAt: number;
		inviterId: string;
	}>;
}

async function loadOrganization(
	ctx: GenericCtx<DataModel>,
	organizationId: string
): Promise<ResolvedOrganization | null> {
	const organization = await findOne(ctx, {
		model: 'organization',
		where: [{ field: '_id', value: organizationId }]
	});
	if (!organization) return null;

	const members = await findMany(ctx, {
		model: 'member',
		where: [{ field: 'organizationId', value: organizationId }],
		paginationOpts: { numItems: 1000, cursor: null }
	});
	const invitations = await findMany(ctx, {
		model: 'invitation',
		where: [
			{ field: 'organizationId', value: organizationId },
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
					userId: String(member.userId),
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
			expiresAt: invitation.expiresAt as number,
			inviterId: String(invitation.inviterId)
		}))
	};
}

/**
 * Resolve the active organization for the current session, or null when
 * unauthenticated or the user has no organization at all. Shared by org
 * queries and the Autumn `identify` hook so billing is always scoped the
 * same way.
 *
 * Falls back to the user's first membership when the session has no (or a
 * stale) `activeOrganizationId` — e.g. the active org was deleted, or
 * personal-org creation failed during sign-up — so org-scoped features
 * self-heal instead of breaking for that session.
 */
export async function resolveActiveOrganization(ctx: GenericCtx<DataModel>) {
	const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
	const session = await auth.api.getSession({ headers });
	if (!session) {
		return null;
	}
	const userId = session.user.id;

	// The caller's membership is the authorization check: the active org is
	// only used if the user actually belongs to it.
	let membership = session.session.activeOrganizationId
		? await findOne(ctx, {
				model: 'member',
				where: [
					{ field: 'userId', value: userId },
					{ field: 'organizationId', value: session.session.activeOrganizationId }
				]
			})
		: null;
	if (!membership) {
		membership = await findOne(ctx, {
			model: 'member',
			where: [{ field: 'userId', value: userId }]
		});
	}
	if (!membership) {
		return null;
	}

	const organization = await loadOrganization(ctx, String(membership.organizationId));
	if (!organization) {
		return null;
	}
	return { session, organization, currentMemberRole: String(membership.role) };
}

/**
 * The active organization with members, pending invitations, and the
 * current user's role. Reactive: updates in real time when members or
 * invitations change.
 */
export const getActiveOrganization = query({
	args: {},
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
					userId: v.string(),
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
					expiresAt: v.number(),
					inviterId: v.string()
				})
			),
			currentUserId: v.string(),
			currentMemberRole: v.union(v.null(), v.string()),
			isOnlyOwnedOrganization: v.boolean()
		})
	),
	handler: async (ctx) => {
		try {
			const resolved = await resolveActiveOrganization(ctx);
			if (!resolved) return null;
			const { session, organization, currentMemberRole } = resolved;
			// Owners can't delete the only organization they own (enforced
			// server-side in auth.ts); the UI uses this to explain why.
			let isOnlyOwnedOrganization = false;
			if (currentMemberRole === 'owner') {
				isOnlyOwnedOrganization = (await countOwnedOrganizations(ctx, session.user.id)) <= 1;
			}
			return {
				...organization,
				currentUserId: session.user.id,
				currentMemberRole,
				isOnlyOwnedOrganization
			};
		} catch (e) {
			// Null for unauthenticated callers, but log unexpected failures —
			// a silent catch here hides real bugs behind "No active organization"
			if (await ctx.auth.getUserIdentity()) {
				console.error('getActiveOrganization failed for authenticated user:', e);
			}
			return null;
		}
	}
});
