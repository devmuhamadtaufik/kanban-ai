import { mutation, query } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { ConvexError, v } from 'convex/values';
import { resolveActiveOrganization } from './organizations';

/**
 * Columns belong to a board. Authorization is checked transitively via the
 * board's orgId, so callers must pass the boardId — a helper resolves the
 * org membership and verifies the board exists before mutating.
 */
async function requireBoard(ctx: MutationCtx, boardId: Id<'boards'>) {
	const resolved = await resolveActiveOrganization(ctx);
	if (!resolved) throw new ConvexError('No active organization');
	const board = await ctx.db.get(boardId);
	if (!board || board.orgId !== resolved.organization.id) {
		throw new ConvexError('Board not found');
	}
	return { resolved, board };
}

const columnValidator = v.object({
	_id: v.id('columns'),
	_creationTime: v.number(),
	boardId: v.id('boards'),
	name: v.string(),
	color: v.optional(v.string()),
	order: v.number(),
	wipLimit: v.optional(v.number())
});

export const list = query({
	args: { boardId: v.id('boards') },
	returns: v.union(v.null(), v.array(columnValidator)),
	handler: async (ctx, args) => {
		const resolved = await resolveActiveOrganization(ctx);
		if (!resolved) return null;
		const board = await ctx.db.get(args.boardId);
		if (!board || board.orgId !== resolved.organization.id) return null;
		return await ctx.db
			.query('columns')
			.withIndex('by_boardId', (q) => q.eq('boardId', args.boardId))
			.order('asc')
			.collect();
	}
});

export const create = mutation({
	args: {
		boardId: v.id('boards'),
		name: v.string(),
		color: v.optional(v.string()),
		wipLimit: v.optional(v.number())
	},
	returns: v.id('columns'),
	handler: async (ctx, args) => {
		await requireBoard(ctx, args.boardId);

		// Determine the new column's order (end of the list).
		const existing = await ctx.db
			.query('columns')
			.withIndex('by_boardId', (q) => q.eq('boardId', args.boardId))
			.collect();
		const order = existing.length;

		const columnId = await ctx.db.insert('columns', {
			boardId: args.boardId,
			name: args.name,
			color: args.color,
			order,
			wipLimit: args.wipLimit
		});

		// Append to the board's columnOrder.
		const board = await ctx.db.get(args.boardId);
		if (board) {
			await ctx.db.patch(args.boardId, {
				columnOrder: [...board.columnOrder, columnId],
				updatedAt: Date.now()
			});
		}
		return columnId;
	}
});

export const update = mutation({
	args: {
		columnId: v.id('columns'),
		name: v.optional(v.string()),
		color: v.optional(v.string()),
		wipLimit: v.optional(v.number())
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const column = await ctx.db.get(args.columnId);
		if (!column) throw new ConvexError('Column not found');
		await requireBoard(ctx, column.boardId);

		const patch: {
			name?: string;
			color?: string;
			wipLimit?: number;
		} = {};
		if (args.name !== undefined) patch.name = args.name;
		if (args.color !== undefined) patch.color = args.color ?? undefined;
		if (args.wipLimit !== undefined) patch.wipLimit = args.wipLimit ?? undefined;
		await ctx.db.patch(args.columnId, patch);
		return null;
	}
});

export const remove = mutation({
	args: { columnId: v.id('columns') },
	returns: v.null(),
	handler: async (ctx, args) => {
		const column = await ctx.db.get(args.columnId);
		if (!column) throw new ConvexError('Column not found');
		const { board } = await requireBoard(ctx, column.boardId);

		// Delete cards in this column.
		const cards = await ctx.db
			.query('cards')
			.withIndex('by_columnId', (q) => q.eq('columnId', args.columnId))
			.collect();
		for (const card of cards) {
			const comments = await ctx.db
				.query('comments')
				.withIndex('by_cardId', (q) => q.eq('cardId', card._id))
				.collect();
			for (const comment of comments) await ctx.db.delete(comment._id);
			const activities = await ctx.db
				.query('activities')
				.withIndex('by_cardId', (q) => q.eq('cardId', card._id))
				.collect();
			for (const activity of activities) await ctx.db.delete(activity._id);
			await ctx.db.delete(card._id);
		}

		await ctx.db.delete(args.columnId);

		// Remove from board's columnOrder.
		if (board) {
			const columnIdStr = String(args.columnId);
			await ctx.db.patch(column.boardId, {
				columnOrder: board.columnOrder.filter((id: unknown) => String(id) !== columnIdStr),
				updatedAt: Date.now()
			});
		}

		return null;
	}
});

export const reorder = mutation({
	args: {
		boardId: v.id('boards'),
		columnOrder: v.array(v.id('columns'))
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireBoard(ctx, args.boardId);
		await ctx.db.patch(args.boardId, {
			columnOrder: args.columnOrder,
			updatedAt: Date.now()
		});

		// Persist per-column order field to match the new sequence.
		for (let i = 0; i < args.columnOrder.length; i++) {
			await ctx.db.patch(args.columnOrder[i], { order: i });
		}
		return null;
	}
});
