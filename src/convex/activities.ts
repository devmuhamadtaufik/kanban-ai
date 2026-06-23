import { query } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { v } from 'convex/values';
import { resolveActiveOrganization } from './organizations';

/**
 * Activity log helper. Every card mutation (create / move / assign / label /
 * update) records an entry here so the UI can show an audit trail and the
 * AI features can mine patterns.
 *
 * `logActivity` is a plain async helper (not a registered Convex function)
 * so it can be called inside other mutations without crossing a function
 * boundary — keeping the whole operation in one transaction.
 */
export type ActivityType = 'moved' | 'assigned' | 'created' | 'updated' | 'commented' | 'labeled';

export async function logActivity(
	ctx: MutationCtx,
	params: {
		cardId: Id<'cards'>;
		boardId: Id<'boards'>;
		actorId: string;
		type: ActivityType;
		metadata?: string;
	}
) {
	await ctx.db.insert('activities', {
		cardId: params.cardId,
		boardId: params.boardId,
		actorId: params.actorId,
		type: params.type,
		metadata: params.metadata,
		createdAt: Date.now()
	});
}

const activityValidator = v.object({
	_id: v.id('activities'),
	_creationTime: v.number(),
	cardId: v.id('cards'),
	boardId: v.id('boards'),
	type: v.union(
		v.literal('moved'),
		v.literal('assigned'),
		v.literal('created'),
		v.literal('updated'),
		v.literal('commented'),
		v.literal('labeled')
	),
	actorId: v.string(),
	metadata: v.optional(v.string()),
	createdAt: v.number()
});

export const listForCard = query({
	args: { cardId: v.id('cards') },
	returns: v.union(v.null(), v.array(activityValidator)),
	handler: async (ctx, args) => {
		const resolved = await resolveActiveOrganization(ctx);
		if (!resolved) return null;
		// Verify the card belongs to a board in this org.
		const card = await ctx.db.get(args.cardId);
		if (!card) return null;
		const board = await ctx.db.get(card.boardId);
		if (!board || board.orgId !== resolved.organization.id) return null;
		return await ctx.db
			.query('activities')
			.withIndex('by_cardId', (q) => q.eq('cardId', args.cardId))
			.order('desc')
			.collect();
	}
});

export const listForBoard = query({
	args: { boardId: v.id('boards') },
	returns: v.union(v.null(), v.array(activityValidator)),
	handler: async (ctx, args) => {
		const resolved = await resolveActiveOrganization(ctx);
		if (!resolved) return null;
		const board = await ctx.db.get(args.boardId);
		if (!board || board.orgId !== resolved.organization.id) return null;
		return await ctx.db
			.query('activities')
			.withIndex('by_boardId', (q) => q.eq('boardId', args.boardId))
			.order('desc')
			.collect();
	}
});
