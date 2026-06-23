import { mutation, query } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { ConvexError, v } from 'convex/values';
import { resolveActiveOrganization } from './organizations';

/**
 * Sprints are time-boxed iterations within a board. A sprint starts in
 * `planned`, moves to `active` when the team commits to it, and ends in
 * `completed`. Cards reference a sprint via `sprintId` (nullable — null
 * means the card is in the product backlog).
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

const sprintValidator = v.object({
	_id: v.id('sprints'),
	_creationTime: v.number(),
	boardId: v.id('boards'),
	name: v.string(),
	goal: v.optional(v.string()),
	startDate: v.number(),
	endDate: v.number(),
	status: v.union(v.literal('planned'), v.literal('active'), v.literal('completed')),
	createdAt: v.number()
});

export const list = query({
	args: { boardId: v.id('boards') },
	returns: v.union(v.null(), v.array(sprintValidator)),
	handler: async (ctx, args) => {
		const resolved = await resolveActiveOrganization(ctx);
		if (!resolved) return null;
		const board = await ctx.db.get(args.boardId);
		if (!board || board.orgId !== resolved.organization.id) return null;
		return await ctx.db
			.query('sprints')
			.withIndex('by_boardId_status', (q) => q.eq('boardId', args.boardId))
			.collect();
	}
});

export const get = query({
	args: { sprintId: v.id('sprints') },
	returns: v.union(v.null(), sprintValidator),
	handler: async (ctx, args) => {
		const resolved = await resolveActiveOrganization(ctx);
		if (!resolved) return null;
		const sprint = await ctx.db.get(args.sprintId);
		if (!sprint) return null;
		const board = await ctx.db.get(sprint.boardId);
		if (!board || board.orgId !== resolved.organization.id) return null;
		return sprint;
	}
});

export const getActive = query({
	args: { boardId: v.id('boards') },
	returns: v.union(v.null(), sprintValidator),
	handler: async (ctx, args) => {
		const resolved = await resolveActiveOrganization(ctx);
		if (!resolved) return null;
		const board = await ctx.db.get(args.boardId);
		if (!board || board.orgId !== resolved.organization.id) return null;
		const sprints = await ctx.db
			.query('sprints')
			.withIndex('by_boardId_status', (q) => q.eq('boardId', args.boardId))
			.collect();
		return sprints.find((s) => s.status === 'active') ?? null;
	}
});

export const create = mutation({
	args: {
		boardId: v.id('boards'),
		name: v.string(),
		goal: v.optional(v.string()),
		startDate: v.number(),
		endDate: v.number()
	},
	returns: v.id('sprints'),
	handler: async (ctx, args) => {
		await requireBoard(ctx, args.boardId);
		if (args.endDate <= args.startDate) {
			throw new ConvexError('Sprint end date must be after start date');
		}
		return await ctx.db.insert('sprints', {
			boardId: args.boardId,
			name: args.name,
			goal: args.goal,
			startDate: args.startDate,
			endDate: args.endDate,
			status: 'planned',
			createdAt: Date.now()
		});
	}
});

export const update = mutation({
	args: {
		sprintId: v.id('sprints'),
		name: v.optional(v.string()),
		goal: v.optional(v.string()),
		startDate: v.optional(v.number()),
		endDate: v.optional(v.number())
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const sprint = await ctx.db.get(args.sprintId);
		if (!sprint) throw new ConvexError('Sprint not found');
		await requireBoard(ctx, sprint.boardId);

		const patch: {
			name?: string;
			goal?: string;
			startDate?: number;
			endDate?: number;
		} = {};
		if (args.name !== undefined) patch.name = args.name;
		if (args.goal !== undefined) patch.goal = args.goal ?? undefined;
		if (args.startDate !== undefined) patch.startDate = args.startDate;
		if (args.endDate !== undefined) patch.endDate = args.endDate;

		const start = patch.startDate ?? sprint.startDate;
		const end = patch.endDate ?? sprint.endDate;
		if (end <= start) {
			throw new ConvexError('Sprint end date must be after start date');
		}

		await ctx.db.patch(args.sprintId, patch);
		return null;
	}
});

export const start = mutation({
	args: { sprintId: v.id('sprints') },
	returns: v.null(),
	handler: async (ctx, args) => {
		const sprint = await ctx.db.get(args.sprintId);
		if (!sprint) throw new ConvexError('Sprint not found');
		await requireBoard(ctx, sprint.boardId);
		if (sprint.status !== 'planned') {
			throw new ConvexError('Only planned sprints can be started');
		}
		// Only one active sprint per board at a time.
		const sprints = await ctx.db
			.query('sprints')
			.withIndex('by_boardId_status', (q) => q.eq('boardId', sprint.boardId))
			.collect();
		const hasActive = sprints.some((s) => s.status === 'active');
		if (hasActive) {
			throw new ConvexError('This board already has an active sprint');
		}
		await ctx.db.patch(args.sprintId, { status: 'active' });
		return null;
	}
});

export const complete = mutation({
	args: { sprintId: v.id('sprints') },
	returns: v.null(),
	handler: async (ctx, args) => {
		const sprint = await ctx.db.get(args.sprintId);
		if (!sprint) throw new ConvexError('Sprint not found');
		await requireBoard(ctx, sprint.boardId);
		if (sprint.status !== 'active') {
			throw new ConvexError('Only active sprints can be completed');
		}
		await ctx.db.patch(args.sprintId, { status: 'completed' });

		// Move any incomplete cards back to the product backlog (clear sprintId).
		const cards = await ctx.db
			.query('cards')
			.withIndex('by_sprintId', (q) => q.eq('sprintId', args.sprintId))
			.collect();
		for (const card of cards) {
			await ctx.db.patch(card._id, { sprintId: undefined, updatedAt: Date.now() });
		}
		return null;
	}
});

export const remove = mutation({
	args: { sprintId: v.id('sprints') },
	returns: v.null(),
	handler: async (ctx, args) => {
		const sprint = await ctx.db.get(args.sprintId);
		if (!sprint) throw new ConvexError('Sprint not found');
		await requireBoard(ctx, sprint.boardId);
		if (sprint.status === 'active') {
			throw new ConvexError('Cannot delete an active sprint; complete it first');
		}

		// Detach cards from this sprint (return them to the backlog).
		const cards = await ctx.db
			.query('cards')
			.withIndex('by_sprintId', (q) => q.eq('sprintId', args.sprintId))
			.collect();
		for (const card of cards) {
			await ctx.db.patch(card._id, { sprintId: undefined, updatedAt: Date.now() });
		}

		// Delete retrospectives tied to this sprint.
		const retros = await ctx.db
			.query('retrospectives')
			.withIndex('by_sprintId', (q) => q.eq('sprintId', args.sprintId))
			.collect();
		for (const retro of retros) await ctx.db.delete(retro._id);

		await ctx.db.delete(args.sprintId);
		return null;
	}
});
