import { query } from './_generated/server';
import { v } from 'convex/values';
import { type DataModel } from './_generated/dataModel';
import { type GenericCtx } from '@convex-dev/better-auth';
import { authComponent, createAuth } from './auth';

/**
 * Organization helpers built on the Better Auth organization plugin.
 *
 * Organization CRUD (create/update/delete, invitations, member roles) goes
 * through the Better Auth client (`authClient.organization.*`) on the
 * frontend. The queries here exist for what the client can't do well:
 * reactive, real-time reads of the active organization from Convex.
 */

/**
 * Resolve the active organization for the current session, or null when
 * unauthenticated or the user has no organization at all. Shared by org
 * queries and the Autumn `identify` hook so billing is always scoped the
 * same way.
 *
 * Falls back to the user's first organization when the session has no
 * (or a stale) `activeOrganizationId` — e.g. if personal-org creation
 * failed during sign-up and the user created one later — so org-scoped
 * features self-heal instead of breaking for that session.
 */
export async function resolveActiveOrganization(ctx: GenericCtx<DataModel>) {
	const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
	const session = await auth.api.getSession({ headers });
	if (!session) {
		return null;
	}
	// Uses the session's active organization; membership is enforced by Better Auth.
	let organization = session.session.activeOrganizationId
		? await auth.api.getFullOrganization({ headers })
		: null;
	if (!organization) {
		const organizations = await auth.api.listOrganizations({ headers });
		const fallback = organizations[0];
		if (!fallback) {
			return null;
		}
		organization = await auth.api.getFullOrganization({
			headers,
			query: { organizationId: fallback.id }
		});
		if (!organization) {
			return null;
		}
	}
	const currentMemberRole =
		organization.members.find((member) => member.userId === session.user.id)?.role ?? null;
	return { session, organization, currentMemberRole };
}

// Better Auth returns Date instances; Convex values only support numbers.
const toMillis = (value: Date | number | string): number =>
	value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);

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
			currentMemberRole: v.union(v.null(), v.string())
		})
	),
	handler: async (ctx) => {
		try {
			const resolved = await resolveActiveOrganization(ctx);
			if (!resolved) return null;
			const { session, organization, currentMemberRole } = resolved;
			return {
				id: organization.id,
				name: organization.name,
				slug: organization.slug,
				logo: organization.logo ?? null,
				metadata: organization.metadata ?? null,
				createdAt: toMillis(organization.createdAt),
				members: organization.members.map((member) => ({
					id: member.id,
					userId: member.userId,
					role: member.role,
					createdAt: toMillis(member.createdAt),
					user: {
						name: member.user.name,
						email: member.user.email,
						image: member.user.image ?? null
					}
				})),
				invitations: organization.invitations
					.filter((invitation) => invitation.status === 'pending')
					.map((invitation) => ({
						id: invitation.id,
						email: invitation.email,
						role: invitation.role ?? null,
						status: invitation.status,
						expiresAt: toMillis(invitation.expiresAt),
						inviterId: invitation.inviterId
					})),
				currentUserId: session.user.id,
				currentMemberRole
			};
		} catch {
			// Return null when unauthenticated
			return null;
		}
	}
});
