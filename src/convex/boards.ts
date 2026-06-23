import { mutation, query } from './_generated/server';
import { ConvexError, v } from 'convex/values';
import { resolveActiveOrganization } from './organizations';

/**
 * Boards are the top-level scrum workspace, scoped to the active
 * organization. Every member of the org can view boards; owners and
 * admins can create / update / delete them.
 */
const boardValidator = v.object({
	_id: v.id('boards'),
	_creationTime: v.number(),
	orgId: v.string(),
	name: v.string(),
	description: v.optional(v.string()),
	columnOrder: v.array(v.id('columns')),
	createdAt: v.number(),
	updatedAt: v.number()
});

export const list = query({
	args: {},
	returns: v.union(v.null(), v.array(boardValidator)),
	handler: async (ctx) => {
		const resolved = await resolveActiveOrganization(ctx);
		if (!resolved) return null;
		return await ctx.db
			.query('boards')
			.withIndex('by_orgId', (q) => q.eq('orgId', resolved.organization.id))
			.collect();
	}
});

export const get = query({
	args: { boardId: v.id('boards') },
	returns: v.union(v.null(), boardValidator),
	handler: async (ctx, args) => {
		const resolved = await resolveActiveOrganization(ctx);
		if (!resolved) return null;
		const board = await ctx.db.get(args.boardId);
		if (!board || board.orgId !== resolved.organization.id) return null;
		return board;
	}
});

export const create = mutation({
	args: {
		name: v.string(),
		description: v.optional(v.string())
	},
	returns: v.id('boards'),
	handler: async (ctx, args) => {
		const resolved = await resolveActiveOrganization(ctx);
		if (!resolved) throw new ConvexError('No active organization');
		const now = Date.now();
		const boardId = await ctx.db.insert('boards', {
			orgId: resolved.organization.id,
			name: args.name,
			description: args.description,
			columnOrder: [],
			createdAt: now,
			updatedAt: now
		});
		return boardId;
	}
});

export const update = mutation({
	args: {
		boardId: v.id('boards'),
		name: v.optional(v.string()),
		description: v.optional(v.string())
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const resolved = await resolveActiveOrganization(ctx);
		if (!resolved) throw new ConvexError('No active organization');
		const board = await ctx.db.get(args.boardId);
		if (!board || board.orgId !== resolved.organization.id) {
			throw new ConvexError('Board not found');
		}
		const patch: { name?: string; description?: string; updatedAt?: number } = {
			updatedAt: Date.now()
		};
		if (args.name !== undefined) patch.name = args.name;
		if (args.description !== undefined) patch.description = args.description ?? undefined;
		await ctx.db.patch(args.boardId, patch);
		return null;
	}
});

export const remove = mutation({
	args: { boardId: v.id('boards') },
	returns: v.null(),
	handler: async (ctx, args) => {
		const resolved = await resolveActiveOrganization(ctx);
		if (!resolved) throw new ConvexError('No active organization');
		const board = await ctx.db.get(args.boardId);
		if (!board || board.orgId !== resolved.organization.id) {
			throw new ConvexError('Board not found');
		}

		// Cascade delete children: cards, columns, labels, sprints, retrospectives.
		const columns = await ctx.db
			.query('columns')
			.withIndex('by_boardId', (q) => q.eq('boardId', args.boardId))
			.collect();
		for (const column of columns) await ctx.db.delete(column._id);

		const cards = await ctx.db
			.query('cards')
			.withIndex('by_boardId', (q) => q.eq('boardId', args.boardId))
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

		const labels = await ctx.db
			.query('labels')
			.withIndex('by_boardId', (q) => q.eq('boardId', args.boardId))
			.collect();
		for (const label of labels) await ctx.db.delete(label._id);

		const sprints = await ctx.db
			.query('sprints')
			.withIndex('by_boardId_status', (q) => q.eq('boardId', args.boardId))
			.collect();
		for (const sprint of sprints) {
			const retros = await ctx.db
				.query('retrospectives')
				.withIndex('by_sprintId', (q) => q.eq('sprintId', sprint._id))
				.collect();
			for (const retro of retros) await ctx.db.delete(retro._id);
			await ctx.db.delete(sprint._id);
		}

		await ctx.db.delete(args.boardId);
		return null;
	}
});

export const setColumnOrder = mutation({
	args: {
		boardId: v.id('boards'),
		columnOrder: v.array(v.id('columns'))
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const resolved = await resolveActiveOrganization(ctx);
		if (!resolved) throw new ConvexError('No active organization');
		const board = await ctx.db.get(args.boardId);
		if (!board || board.orgId !== resolved.organization.id) {
			throw new ConvexError('Board not found');
		}
		await ctx.db.patch(args.boardId, {
			columnOrder: args.columnOrder,
			updatedAt: Date.now()
		});
		return null;
	}
});
