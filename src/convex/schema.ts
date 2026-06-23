import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

/**
 * App-level schema for kanban/scrum domain tables.
 *
 * Better Auth tables (user, session, account, organization, member, etc.)
 * live in the Better Auth component schema at `./betterAuth/schema.ts`.
 * Cross-component references to org/user IDs use `v.string()` because the
 * component table IDs are plain strings from the app's perspective.
 *
 * Domain data is scoped to the active organization via `orgId` on every
 * top-level table (boards). Child tables inherit the scope transitively
 * through their parent (boardId / sprintId / cardId).
 */
export default defineSchema({
	// --- Boards ---------------------------------------------------------------
	boards: defineTable({
		orgId: v.string(),
		name: v.string(),
		description: v.optional(v.string()),
		columnOrder: v.array(v.id('columns')),
		createdAt: v.number(),
		updatedAt: v.number()
	}).index('by_orgId', ['orgId']),

	// --- Columns --------------------------------------------------------------
	columns: defineTable({
		boardId: v.id('boards'),
		name: v.string(),
		color: v.optional(v.string()),
		order: v.number(),
		wipLimit: v.optional(v.number())
	}).index('by_boardId', ['boardId']),

	// --- Cards ----------------------------------------------------------------
	cards: defineTable({
		boardId: v.id('boards'),
		columnId: v.id('columns'),
		sprintId: v.optional(v.id('sprints')),
		title: v.string(),
		description: v.optional(v.string()),
		storyPoints: v.optional(v.number()),
		assigneeId: v.optional(v.string()),
		priority: v.union(
			v.literal('low'),
			v.literal('medium'),
			v.literal('high'),
			v.literal('urgent')
		),
		labels: v.array(v.id('labels')),
		order: v.number(),
		dueDate: v.optional(v.number()),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_boardId', ['boardId'])
		.index('by_columnId', ['columnId'])
		.index('by_sprintId', ['sprintId'])
		.index('by_assigneeId', ['assigneeId']),

	// --- Sprints --------------------------------------------------------------
	sprints: defineTable({
		boardId: v.id('boards'),
		name: v.string(),
		goal: v.optional(v.string()),
		startDate: v.number(),
		endDate: v.number(),
		status: v.union(v.literal('planned'), v.literal('active'), v.literal('completed')),
		createdAt: v.number()
	}).index('by_boardId_status', ['boardId', 'status']),

	// --- Labels ---------------------------------------------------------------
	labels: defineTable({
		boardId: v.id('boards'),
		name: v.string(),
		color: v.string()
	}).index('by_boardId', ['boardId']),

	// --- Comments -------------------------------------------------------------
	comments: defineTable({
		cardId: v.id('cards'),
		authorId: v.string(),
		content: v.string(),
		createdAt: v.number(),
		updatedAt: v.number()
	}).index('by_cardId', ['cardId']),

	// --- Activities -----------------------------------------------------------
	activities: defineTable({
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
	})
		.index('by_cardId', ['cardId'])
		.index('by_boardId', ['boardId']),

	// --- Retrospectives -------------------------------------------------------
	retrospectives: defineTable({
		sprintId: v.id('sprints'),
		type: v.union(v.literal('went_well'), v.literal('didnt_go_well'), v.literal('action_item')),
		content: v.string(),
		authorId: v.string(),
		createdAt: v.number()
	}).index('by_sprintId', ['sprintId']),

	// --- AI Settings (per-org LLM provider config) ----------------------------
	aiSettings: defineTable({
		orgId: v.string(),
		provider: v.union(v.literal('openai'), v.literal('anthropic'), v.literal('google')),
		model: v.string(),
		apiKeyEncrypted: v.optional(v.string()),
		enabled: v.boolean(),
		createdAt: v.number(),
		updatedAt: v.number()
	}).index('by_orgId', ['orgId']),

	// --- AI Usage Logs (metering per-org, feeds billing) ----------------------
	aiUsageLogs: defineTable({
		orgId: v.string(),
		userId: v.string(),
		feature: v.string(),
		model: v.string(),
		requestId: v.string(),
		createdAt: v.number()
	}).index('by_orgId_createdAt', ['orgId', 'createdAt'])
});
