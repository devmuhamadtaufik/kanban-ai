import { mutation, query } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { ConvexError, v } from 'convex/values';
import { resolveActiveOrganization } from './organizations';

/**
 * Labels are board-scoped tags (e.g. "bug", "feature", "tech-debt") used to
 * categorize cards. Colors are stored as CSS strings (hex / oklch / named).
 */
async function requireBoard(ctx: MutationCtx, boardId: Id<'boards'>) {
	const resolved = await resolveActiveOrganization(ctx);
	if (!resolved) throw new ConvexError('No active organization');
	const board = await ctx.db.get(boardId);
	if (!board || board.orgId !== resolved.organization.id) {
		throw new ConvexError('Board not found');
	}
	return resolved;
}

const labelValidator = v.object({
	_id: v.id('labels'),
	_creationTime: v.number(),
	boardId: v.id('boards'),
	name: v.string(),
	color: v.string()
});

export const list = query({
	args: { boardId: v.id('boards') },
	returns: v.union(v.null(), v.array(labelValidator)),
	handler: async (ctx, args) => {
		const resolved = await resolveActiveOrganization(ctx);
		if (!resolved) return null;
		const board = await ctx.db.get(args.boardId);
		if (!board || board.orgId !== resolved.organization.id) return null;
		return await ctx.db
			.query('labels')
			.withIndex('by_boardId', (q) => q.eq('boardId', args.boardId))
			.collect();
	}
});

export const create = mutation({
	args: {
		boardId: v.id('boards'),
		name: v.string(),
		color: v.string()
	},
	returns: v.id('labels'),
	handler: async (ctx, args) => {
		await requireBoard(ctx, args.boardId);
		return await ctx.db.insert('labels', {
			boardId: args.boardId,
			name: args.name,
			color: args.color
		});
	}
});

export const update = mutation({
	args: {
		labelId: v.id('labels'),
		name: v.optional(v.string()),
		color: v.optional(v.string())
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const label = await ctx.db.get(args.labelId);
		if (!label) throw new ConvexError('Label not found');
		await requireBoard(ctx, label.boardId);

		const patch: { name?: string; color?: string } = {};
		if (args.name !== undefined) patch.name = args.name;
		if (args.color !== undefined) patch.color = args.color;
		await ctx.db.patch(args.labelId, patch);
		return null;
	}
});

export const remove = mutation({
	args: { labelId: v.id('labels') },
	returns: v.null(),
	handler: async (ctx, args) => {
		const label = await ctx.db.get(args.labelId);
		if (!label) throw new ConvexError('Label not found');
		await requireBoard(ctx, label.boardId);

		// Remove the label from every card that references it.
		const cards = await ctx.db
			.query('cards')
			.withIndex('by_boardId', (q) => q.eq('boardId', label.boardId))
			.collect();
		for (const card of cards) {
			const labelIdStr = String(args.labelId);
			if (card.labels.some((id: unknown) => String(id) === labelIdStr)) {
				await ctx.db.patch(card._id, {
					labels: card.labels.filter((id: unknown) => String(id) !== labelIdStr),
					updatedAt: Date.now()
				});
			}
		}

		await ctx.db.delete(args.labelId);
		return null;
	}
});
