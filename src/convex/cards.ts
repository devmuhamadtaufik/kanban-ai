import { mutation, query } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { ConvexError, v } from 'convex/values';
import { resolveActiveOrganization } from './organizations';
import { logActivity, type ActivityType } from './activities';

/**
 * Cards are the atomic unit of work in the scrum board. They live in a
 * column, optionally belong to a sprint, and carry an assignee, story
 * points, priority, labels, and a due date.
 *
 * Authorization is transitive through the board's orgId, verified on every
 * mutation. Reads (`list`) also verify org membership so a user from org A
 * cannot read cards from org B even with a leaked board id.
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

const cardValidator = v.object({
	_id: v.id('cards'),
	_creationTime: v.number(),
	boardId: v.id('boards'),
	columnId: v.id('columns'),
	sprintId: v.optional(v.id('sprints')),
	title: v.string(),
	description: v.optional(v.string()),
	storyPoints: v.optional(v.number()),
	assigneeId: v.optional(v.string()),
	priority: v.union(v.literal('low'), v.literal('medium'), v.literal('high'), v.literal('urgent')),
	labels: v.array(v.id('labels')),
	order: v.number(),
	dueDate: v.optional(v.number()),
	createdAt: v.number(),
	updatedAt: v.number()
});

export const list = query({
	args: { boardId: v.id('boards') },
	returns: v.union(v.null(), v.array(cardValidator)),
	handler: async (ctx, args) => {
		const resolved = await resolveActiveOrganization(ctx);
		if (!resolved) return null;
		const board = await ctx.db.get(args.boardId);
		if (!board || board.orgId !== resolved.organization.id) return null;
		return await ctx.db
			.query('cards')
			.withIndex('by_boardId', (q) => q.eq('boardId', args.boardId))
			.collect();
	}
});

export const listForSprint = query({
	args: { sprintId: v.id('sprints') },
	returns: v.union(v.null(), v.array(cardValidator)),
	handler: async (ctx, args) => {
		const resolved = await resolveActiveOrganization(ctx);
		if (!resolved) return null;
		const sprint = await ctx.db.get(args.sprintId);
		if (!sprint) return null;
		const board = await ctx.db.get(sprint.boardId);
		if (!board || board.orgId !== resolved.organization.id) return null;
		return await ctx.db
			.query('cards')
			.withIndex('by_sprintId', (q) => q.eq('sprintId', args.sprintId))
			.collect();
	}
});

export const listForBacklog = query({
	args: { boardId: v.id('boards') },
	returns: v.union(v.null(), v.array(cardValidator)),
	handler: async (ctx, args) => {
		const resolved = await resolveActiveOrganization(ctx);
		if (!resolved) return null;
		const board = await ctx.db.get(args.boardId);
		if (!board || board.orgId !== resolved.organization.id) return null;
		const allCards = await ctx.db
			.query('cards')
			.withIndex('by_boardId', (q) => q.eq('boardId', args.boardId))
			.collect();
		return allCards.filter((c) => !c.sprintId);
	}
});

export const get = query({
	args: { cardId: v.id('cards') },
	returns: v.union(v.null(), cardValidator),
	handler: async (ctx, args) => {
		const resolved = await resolveActiveOrganization(ctx);
		if (!resolved) return null;
		const card = await ctx.db.get(args.cardId);
		if (!card) return null;
		const board = await ctx.db.get(card.boardId);
		if (!board || board.orgId !== resolved.organization.id) return null;
		return card;
	}
});

export const create = mutation({
	args: {
		boardId: v.id('boards'),
		columnId: v.id('columns'),
		title: v.string(),
		description: v.optional(v.string()),
		priority: v.optional(
			v.union(v.literal('low'), v.literal('medium'), v.literal('high'), v.literal('urgent'))
		),
		sprintId: v.optional(v.id('sprints'))
	},
	returns: v.id('cards'),
	handler: async (ctx, args) => {
		const resolved = await requireBoard(ctx, args.boardId);

		// Determine the new card's order (end of the column).
		const existing = await ctx.db
			.query('cards')
			.withIndex('by_columnId', (q) => q.eq('columnId', args.columnId))
			.collect();
		const order = existing.length;

		const now = Date.now();
		const cardId = await ctx.db.insert('cards', {
			boardId: args.boardId,
			columnId: args.columnId,
			sprintId: args.sprintId,
			title: args.title,
			description: args.description,
			storyPoints: undefined,
			assigneeId: undefined,
			priority: args.priority ?? 'medium',
			labels: [],
			order,
			dueDate: undefined,
			createdAt: now,
			updatedAt: now
		});

		await logActivity(ctx, {
			cardId,
			boardId: args.boardId,
			actorId: resolved.session.user.id,
			type: 'created'
		});
		return cardId;
	}
});

export const update = mutation({
	args: {
		cardId: v.id('cards'),
		title: v.optional(v.string()),
		description: v.optional(v.union(v.null(), v.string())),
		priority: v.optional(
			v.union(v.literal('low'), v.literal('medium'), v.literal('high'), v.literal('urgent'))
		),
		dueDate: v.optional(v.number()),
		sprintId: v.optional(v.id('sprints'))
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const card = await ctx.db.get(args.cardId);
		if (!card) throw new ConvexError('Card not found');
		const resolved = await requireBoard(ctx, card.boardId);

		const patch: {
			title?: string;
			description?: string;
			priority?: 'low' | 'medium' | 'high' | 'urgent';
			dueDate?: number;
			sprintId?: typeof card.sprintId;
			updatedAt?: number;
		} = { updatedAt: Date.now() };
		if (args.title !== undefined) patch.title = args.title;
		if (args.description !== undefined) patch.description = args.description ?? undefined;
		if (args.priority !== undefined) patch.priority = args.priority;
		if (args.dueDate !== undefined) patch.dueDate = args.dueDate ?? undefined;
		if (args.sprintId !== undefined) patch.sprintId = args.sprintId ?? undefined;
		await ctx.db.patch(args.cardId, patch);

		await logActivity(ctx, {
			cardId: args.cardId,
			boardId: card.boardId,
			actorId: resolved.session.user.id,
			type: 'updated',
			metadata: JSON.stringify({
				fields: Object.keys(args).filter((k) => k !== 'cardId')
			})
		});
		return null;
	}
});

export const move = mutation({
	args: {
		cardId: v.id('cards'),
		targetColumnId: v.id('columns'),
		newOrder: v.number()
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const card = await ctx.db.get(args.cardId);
		if (!card) throw new ConvexError('Card not found');
		const resolved = await requireBoard(ctx, card.boardId);

		// Ensure target column belongs to the same board.
		const targetColumn = await ctx.db.get(args.targetColumnId);
		if (!targetColumn || targetColumn.boardId !== card.boardId) {
			throw new ConvexError('Target column not found');
		}

		await ctx.db.patch(args.cardId, {
			columnId: args.targetColumnId,
			order: args.newOrder,
			updatedAt: Date.now()
		});

		const movedAcrossColumns = card.columnId !== args.targetColumnId;
		const activityType: ActivityType = movedAcrossColumns ? 'moved' : 'updated';
		await logActivity(ctx, {
			cardId: args.cardId,
			boardId: card.boardId,
			actorId: resolved.session.user.id,
			type: activityType,
			metadata: movedAcrossColumns
				? JSON.stringify({
						from: card.columnId,
						to: args.targetColumnId
					})
				: undefined
		});
		return null;
	}
});

export const assign = mutation({
	args: {
		cardId: v.id('cards'),
		assigneeId: v.optional(v.string())
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const card = await ctx.db.get(args.cardId);
		if (!card) throw new ConvexError('Card not found');
		const resolved = await requireBoard(ctx, card.boardId);

		await ctx.db.patch(args.cardId, {
			assigneeId: args.assigneeId ?? undefined,
			updatedAt: Date.now()
		});

		await logActivity(ctx, {
			cardId: args.cardId,
			boardId: card.boardId,
			actorId: resolved.session.user.id,
			type: 'assigned',
			metadata: args.assigneeId
		});
		return null;
	}
});

export const setStoryPoints = mutation({
	args: {
		cardId: v.id('cards'),
		storyPoints: v.optional(v.number())
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const card = await ctx.db.get(args.cardId);
		if (!card) throw new ConvexError('Card not found');
		const resolved = await requireBoard(ctx, card.boardId);

		await ctx.db.patch(args.cardId, {
			storyPoints: args.storyPoints ?? undefined,
			updatedAt: Date.now()
		});

		await logActivity(ctx, {
			cardId: args.cardId,
			boardId: card.boardId,
			actorId: resolved.session.user.id,
			type: 'updated',
			metadata: JSON.stringify({ storyPoints: args.storyPoints })
		});
		return null;
	}
});

export const setLabels = mutation({
	args: {
		cardId: v.id('cards'),
		labels: v.array(v.id('labels'))
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const card = await ctx.db.get(args.cardId);
		if (!card) throw new ConvexError('Card not found');
		const resolved = await requireBoard(ctx, card.boardId);

		await ctx.db.patch(args.cardId, {
			labels: args.labels,
			updatedAt: Date.now()
		});

		await logActivity(ctx, {
			cardId: args.cardId,
			boardId: card.boardId,
			actorId: resolved.session.user.id,
			type: 'labeled',
			metadata: JSON.stringify({ labels: args.labels })
		});
		return null;
	}
});

export const remove = mutation({
	args: { cardId: v.id('cards') },
	returns: v.null(),
	handler: async (ctx, args) => {
		const card = await ctx.db.get(args.cardId);
		if (!card) throw new ConvexError('Card not found');
		await requireBoard(ctx, card.boardId);

		const comments = await ctx.db
			.query('comments')
			.withIndex('by_cardId', (q) => q.eq('cardId', args.cardId))
			.collect();
		for (const comment of comments) await ctx.db.delete(comment._id);

		const activities = await ctx.db
			.query('activities')
			.withIndex('by_cardId', (q) => q.eq('cardId', args.cardId))
			.collect();
		for (const activity of activities) await ctx.db.delete(activity._id);

		await ctx.db.delete(args.cardId);
		return null;
	}
});
