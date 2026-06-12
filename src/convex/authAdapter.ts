import { components } from './_generated/api';
import { type DataModel } from './_generated/dataModel';
import { type GenericCtx } from '@convex-dev/better-auth';

/**
 * Thin typed wrappers for reading the Better Auth component tables directly.
 *
 * Useful where the Better Auth endpoint API can't be used: cross-organization
 * admin reads (no admin API exists for organizations), and reactive Convex
 * queries (endpoints may attempt session writes, which are no-ops in query
 * context and can fail short-lived sessions such as impersonation).
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
