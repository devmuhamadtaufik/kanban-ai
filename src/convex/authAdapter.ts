import { components } from './_generated/api';
import { type DataModel } from './_generated/dataModel';
import { type GenericCtx } from '@convex-dev/better-auth';
import { type FunctionArgs } from 'convex/server';
import { normalizeOrganizationRoles } from '../lib/organizations';

/**
 * Thin typed wrappers for the Better Auth component tables.
 *
 * Policy: organization/member/invitation **mutations** always go through the
 * Better Auth API or its organizationHooks so its validation and hooks run.
 * Direct table access is used only for:
 *
 * - **Reads** where no Better Auth API exists (cross-organization admin
 *   queries) or where its endpoints can't run (reactive Convex queries —
 *   endpoints attempt session writes, which are no-ops in query context and
 *   fail short-lived sessions such as admin impersonation).
 * - **Session `activeOrganizationId` writes** (sign-up backfill, restore
 *   after a rejected deletion). This is a deliberate, narrow exception: no
 *   server-side Better Auth API can set another session's active org, the
 *   field is a convenience pointer rather than an authorization source
 *   (membership is always re-checked when resolving the active org), and the
 *   Convex setup has no secondary storage / cookie cache that could go stale.
 */

export interface Where {
	field: string;
	value: string | number | boolean | string[] | number[] | null;
	operator?: 'eq' | 'ne' | 'in' | 'contains' | 'starts_with' | 'ends_with';
	mode?: 'sensitive' | 'insensitive';
}

export type AuthModel = 'user' | 'organization' | 'member' | 'invitation';

export const findMany = async (
	ctx: GenericCtx<DataModel>,
	args: {
		model: AuthModel;
		where?: Where[];
		sortBy?: { field: string; direction: 'asc' | 'desc' };
		paginationOpts: { numItems: number; cursor: string | null };
	}
) => await ctx.runQuery(components.betterAuth.adapter.findMany, args);

export const findOne = async (
	ctx: GenericCtx<DataModel>,
	args: { model: AuthModel; where: Where[] }
) => await ctx.runQuery(components.betterAuth.adapter.findOne, args);

/**
 * Number of organizations the user owns. Roles are normalized because
 * Better Auth stores multi-role values as comma-separated strings.
 */
export const countOwnedOrganizations = async (
	ctx: GenericCtx<DataModel>,
	userId: string
): Promise<number> => {
	let cursor: string | null = null;
	let count = 0;
	do {
		const memberships = await findMany(ctx, {
			model: 'member',
			where: [{ field: 'userId', value: userId }],
			paginationOpts: { numItems: 200, cursor }
		});
		count += memberships.page.filter(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(member: any) => normalizeOrganizationRoles(member.role).includes('owner')
		).length;
		cursor = memberships.isDone ? null : memberships.continueCursor || null;
	} while (cursor);
	return count;
};

type DeleteManyInput = FunctionArgs<typeof components.betterAuth.adapter.deleteMany>['input'];

/**
 * Delete every row matching `where`, looping until the paginated delete is
 * done. Returns the number of rows removed.
 *
 * This is the one place organization/member/invitation rows are deleted
 * outside the Better Auth API (see the policy note above): the user-deletion
 * cascade in `auth.ts` can't go through the org API — it runs in the admin's
 * session (not a member of the deleted user's orgs) and the
 * `beforeDeleteOrganization` guard intentionally blocks removing a user's last
 * owned org.
 */
export const deleteMany = async (
	ctx: GenericCtx<DataModel>,
	args: { model: AuthModel; where: Where[] }
): Promise<number> => {
	if (!('runMutation' in ctx)) {
		throw new Error('deleteMany requires a mutation or action context');
	}
	const input = { model: args.model, where: args.where } as unknown as DeleteManyInput;
	let deleted = 0;
	for (;;) {
		const result = await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
			input,
			paginationOpts: { numItems: 200, cursor: null }
		});
		deleted += result.count;
		if (result.isDone || result.count === 0) break;
	}
	return deleted;
};

type UpdateManyInput = FunctionArgs<typeof components.betterAuth.adapter.updateMany>['input'];

export const updateMany = async (
	ctx: GenericCtx<DataModel>,
	args: { model: AuthModel | 'session'; where: Where[]; update: Record<string, unknown> }
) => {
	if (!('runMutation' in ctx)) {
		throw new Error('updateMany requires a mutation or action context');
	}
	// The generated input type is a per-model union that can't be narrowed
	// from a dynamic model name; the component still validates at runtime.
	const input = {
		model: args.model,
		where: args.where,
		update: args.update
	} as unknown as UpdateManyInput;
	return await ctx.runMutation(components.betterAuth.adapter.updateMany, {
		input,
		paginationOpts: { numItems: 100, cursor: null }
	});
};
