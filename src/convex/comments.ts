import { mutation, query } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { ConvexError, v } from 'convex/values';
import { resolveActiveOrganization } from './organizations';
import { logActivity } from './activities';

/**
 * Comments are authored by users on a card. Every comment insertion also
 * records a `commented` activity so the activity feed reflects discussions.
 * Edits update `updatedAt`; deletions remove the comment and its activity
 * log entries are preserved (the card's history is immutable).
 */
async function requireCard(ctx: MutationCtx, cardId: Id<'cards'>) {
	const resolved = await resolveActiveOrganization(ctx);
	if (!resolved) throw new ConvexError('No active organization');
	const card = await ctx.db.get(cardId);
	if (!card) throw new ConvexError('Card not found');
	const board = await ctx.db.get(card.boardId);
	if (!board || board.orgId !== resolved.organization.id) {
		throw new ConvexError('Card not found');
	}
	return { resolved, card };
}

const commentValidator = v.object({
	_id: v.id('comments'),
	_creationTime: v.number(),
	cardId: v.id('cards'),
	authorId: v.string(),
	content: v.string(),
	createdAt: v.number(),
	updatedAt: v.number()
});

export const list = query({
	args: { cardId: v.id('cards') },
	returns: v.union(v.null(), v.array(commentValidator)),
	handler: async (ctx, args) => {
		const resolved = await resolveActiveOrganization(ctx);
		if (!resolved) return null;
		const card = await ctx.db.get(args.cardId);
		if (!card) return null;
		const board = await ctx.db.get(card.boardId);
		if (!board || board.orgId !== resolved.organization.id) return null;
		return await ctx.db
			.query('comments')
			.withIndex('by_cardId', (q) => q.eq('cardId', args.cardId))
			.order('asc')
			.collect();
	}
});

export const create = mutation({
	args: {
		cardId: v.id('cards'),
		content: v.string()
	},
	returns: v.id('comments'),
	handler: async (ctx, args) => {
		const { resolved, card } = await requireCard(ctx, args.cardId);
		const now = Date.now();
		const commentId = await ctx.db.insert('comments', {
			cardId: args.cardId,
			authorId: resolved.session.user.id,
			content: args.content,
			createdAt: now,
			updatedAt: now
		});
		await logActivity(ctx, {
			cardId: args.cardId,
			boardId: card.boardId,
			actorId: resolved.session.user.id,
			type: 'commented',
			metadata: commentId
		});
		return commentId;
	}
});

export const update = mutation({
	args: {
		commentId: v.id('comments'),
		content: v.string()
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const comment = await ctx.db.get(args.commentId);
		if (!comment) throw new ConvexError('Comment not found');
		const { resolved } = await requireCard(ctx, comment.cardId);
		// Only the author can edit their comment.
		if (comment.authorId !== resolved.session.user.id) {
			throw new ConvexError('You can only edit your own comments');
		}
		await ctx.db.patch(args.commentId, {
			content: args.content,
			updatedAt: Date.now()
		});
		return null;
	}
});

export const remove = mutation({
	args: { commentId: v.id('comments') },
	returns: v.null(),
	handler: async (ctx, args) => {
		const comment = await ctx.db.get(args.commentId);
		if (!comment) throw new ConvexError('Comment not found');
		const { resolved } = await requireCard(ctx, comment.cardId);
		// Only the author can delete their comment.
		if (comment.authorId !== resolved.session.user.id) {
			throw new ConvexError('You can only delete your own comments');
		}
		await ctx.db.delete(args.commentId);
		return null;
	}
});
