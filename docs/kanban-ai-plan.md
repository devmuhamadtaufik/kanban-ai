# Kanban-AI: Implementation Plan

## Decisions

| Aspect         | Decision                                                        |
| -------------- | --------------------------------------------------------------- |
| Workflow       | Scrum-only (sprint, backlog, retro, story points)               |
| AI Execution   | Async for generate/suggest, streaming for chat assistant        |
| LLM            | Provider-agnostic (org picks model, can swap anytime)           |
| Billing        | Per request via Autumn `messages` feature (already exists)      |
| Core Principle | AI-assisted, human-controlled - all AI output is editable draft |

## Domain Model (Convex Schema)

**File**: `src/convex/schema.ts` - compose with Better Auth schema

| Table            | Fields                                                                                                                           | Indexes              |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------- |
| `boards`         | `orgId: Id<'organization'>`, `name`, `description?`, `columnOrder: Id<'columns'>[]`, `createdAt`, `updatedAt`                    | `by_orgId`           |
| `columns`        | `boardId: Id<'boards'>`, `name`, `color?`, `order: number`, `wipLimit?: number`                                                  | `by_boardId`         |
| `cards`          | `boardId`, `columnId`, `sprintId?`, `title`, `description?`, `storyPoints?: number`, `assigneeId?: Id<'user'>`, `priority: 'low' | 'medium'             | 'high'                                                                               | 'urgent'`, `labels: Id<'labels'>[]`, `order: number`, `dueDate?: number`, `createdAt`, `updatedAt` | `by_boardId`, `by_columnId`, `by_sprintId`, `by_assigneeId` |
| `sprints`        | `boardId`, `name`, `goal?`, `startDate: number`, `endDate: number`, `status: 'planned'                                           | 'active'             | 'completed'`, `createdAt`                                                            | `by_boardId_status`                                                                                |
| `labels`         | `boardId`, `name`, `color`                                                                                                       | `by_boardId`         |
| `comments`       | `cardId`, `authorId: Id<'user'>`, `content`, `createdAt`, `updatedAt`                                                            | `by_cardId`          |
| `activities`     | `cardId`, `boardId`, `type: 'moved'                                                                                              | 'assigned'           | 'created'                                                                            | 'updated'                                                                                          | 'commented'                                                 | 'labeled'`, `actorId: Id<'user'>`, `metadata?: string`, `createdAt` | `by_cardId`, `by_boardId` |
| `retrospectives` | `sprintId`, `type: 'went_well'                                                                                                   | 'didnt_go_well'      | 'action_item'`, `content`, `authorId: Id<'user'>`, `createdAt`                       | `by_sprintId`                                                                                      |
| `aiSettings`     | `orgId: Id<'organization'>`, `provider: 'openai'                                                                                 | 'anthropic'          | 'google'`, `model`, `apiKeyEncrypted?`, `enabled: boolean`, `createdAt`, `updatedAt` | `by_orgId`                                                                                         |
| `aiUsageLogs`    | `orgId`, `userId: Id<'user'>`, `feature: string`, `model: string`, `requestId: string`, `createdAt`                              | `by_orgId_createdAt` |

## AI Provider Abstraction Layer

```
src/convex/ai/
  ├── types.ts         # AIProvider interface, AIRequest, AIResponse types
  ├── provider.ts      # getProvider(settings) -> adapter instance
  ├── openai.ts         # OpenAI adapter (GPT-4o, GPT-4o-mini, o1, etc)
  ├── anthropic.ts      # Anthropic adapter (Claude 3.5 Sonnet, etc)
  ├── google.ts         # Google adapter (Gemini, etc) - future
  ├── router.ts         # Route request -> provider -> billing.track
  ├── prompts/
  │   ├── backlog.ts       # Backlog generation prompts
  │   ├── sprint.ts        # Sprint planning prompts
  │   ├── estimation.ts    # Story point estimation prompts
  │   ├── retro.ts         # Retrospective generation prompts
  │   ├── search.ts        # Natural language search prompts
  │   └── chat.ts          # Chat assistant system prompt
  └── billing.ts       # checkBalance + trackUsage (wraps billing functions)
```

### Flow for Every AI Call

```
User trigger AI feature
  -> Convex action (e.g., ai.generateBacklog)
    -> resolveActiveOrganization (authz)
    -> ai.billing.checkBalance('messages')  <- Autumn check
    -> ai.provider.getProvider(orgSettings) -> adapter
    -> adapter.complete(prompt, context)
    -> ai.billing.trackUsage('messages', 1)  <- internal track
    -> ai.router.saveLog(orgId, userId, feature, model)
    -> return result to client
  -> User sees AI output as DRAFT/SUGGESTION
  -> User edits/approves -> manual mutation saves to DB
```

## Routes & Pages

```
src/routes/(app)/
  ├── boards/
  │   ├── +page.svelte              # List all boards (org-scoped)
  │   └── +page.server.ts           # SSR: load boards list
  ├── board/
  │   └── [boardId]/
  │       ├── +page.svelte          # Board view (columns + cards)
  │       ├── +page.server.ts       # SSR: load board + columns + cards
  │       └── components/
  │           ├── board-view.svelte      # Main board layout
  │           ├── board-column.svelte    # Column with cards (drop target)
  │           ├── board-card.svelte      # Card (draggable)
  │           ├── card-detail.svelte     # Card detail drawer/dialog
  │           ├── card-comments.svelte   # Comments thread
  │           ├── card-activity.svelte    # Activity log
  │           └── ai-suggest-button.svelte # Reusable AI trigger button
  ├── backlog/
  │   └── [boardId]/
  │       ├── +page.svelte          # Product backlog view (all unassigned cards)
  │       └── +page.server.ts
  ├── sprint/
  │   └── [boardId]/
  │       ├── +page.svelte          # Active sprint view + sprint planning
  │       ├── +page.server.ts
  │       └── components/
  │           ├── sprint-planning.svelte  # Drag from backlog -> sprint
  │           ├── burndown-chart.svelte   # Sprint progress chart
  │           ├── planning-poker.svelte  # Estimation voting UI
  │           └── ai-sprint-suggest.svelte
  ├── retro/
  │   └── [sprintId]/
  │       ├── +page.svelte          # Retrospective board (3 columns)
  │       ├── +page.server.ts
  │       └── components/
  │           ├── retro-board.svelte
  │           └── ai-retro-generate.svelte
  └── ai-assistant/
      └── [boardId]/
          └── +page.svelte          # Chat assistant panel (streaming)
```

**Sidebar update** (`app-sidebar.svelte` lines 47-77):

- Replace `Analytics` -> `Boards` -> `/boards`
- Replace `Projects` -> `Sprints` -> `/sprint/[activeBoardId]`
- Add `Backlog` -> `/backlog/[activeBoardId]`

## Components

```
src/lib/components/
  ├── board/
  │   ├── board-view.svelte          # Reusable board (used in board + sprint views)
  │   ├── board-column.svelte        # Drop target column
  │   ├── board-card.svelte          # Draggable card
  │   ├── card-detail-drawer.svelte  # Card detail (opens on click)
  │   ├── card-comments.svelte
  │   ├── card-activity-feed.svelte
  │   ├── card-labels.svelte
  │   ├── card-assignee.svelte
  │   └── card-story-points.svelte
  ├── sprint/
  │   ├── sprint-header.svelte       # Sprint name, goal, dates, status
  │   ├── burndown-chart.svelte      # SVG chart (or lightweight lib)
  │   ├── planning-poker.svelte       # Estimation voting
  │   └── sprint-progress.svelte
  ├── retro/
  │   ├── retro-column.svelte         # "Went well" / "Didn't" / "Actions"
  │   └── retro-card.svelte
  ├── ai/
  │   ├── ai-button.svelte           # Trigger AI action (async, shows loading)
  │   ├── ai-suggestion-panel.svelte # Display AI output as editable draft
  │   ├── ai-chat-panel.svelte        # Streaming chat UI
  │   ├── ai-chat-message.svelte      # Individual message bubble
  │   ├── ai-usage-badge.svelte        # Shows remaining AI requests
  │   └── ai-settings-dialog.svelte   # Org admin: pick provider + model
  └── shared/
      ├── confirm-dialog.svelte
      ├── priority-badge.svelte
      └── label-chip.svelte
```

## Convex Functions

```
src/convex/
  ├── schema.ts               # NEW: domain tables + compose with auth schema
  ├── boards.ts               # NEW: CRUD queries/mutations (org-scoped)
  ├── columns.ts              # NEW: column CRUD + reorder
  ├── cards.ts                # NEW: card CRUD, move card, assign, label
  ├── sprints.ts              # NEW: sprint lifecycle (create/start/end)
  ├── labels.ts               # NEW: label CRUD
  ├── comments.ts             # NEW: comment CRUD
  ├── activities.ts           # NEW: activity log (auto-generated on card changes)
  ├── retrospectives.ts       # NEW: retro CRUD
  ├── ai/
  │   ├── settings.ts          # NEW: get/update org AI settings
  │   ├── usage.ts             # NEW: usage logs query + track
  │   ├── backlog.ts           # NEW: action: generate backlog items from idea
  │   ├── sprint.ts            # NEW: action: AI sprint planning suggestion
  │   ├── estimation.ts        # NEW: action: AI story point estimate
  │   ├── retro.ts             # NEW: action: AI generate retro board
  │   ├── search.ts            # NEW: action: natural language search
  │   ├── chat.ts              # NEW: action: AI chat assistant (streaming via HTTP)
  │   ├── provider/            # Provider abstraction (see section above)
  │   └── prompts/             # System prompts per feature
  └── (existing files unchanged)
```

### Pattern: Org-Scoped Mutation

Every mutation/query uses `resolveActiveOrganization` for authz:

```typescript
export const createCard = mutation({
	args: {
		boardId: v.id('boards'),
		columnId: v.id('columns'),
		title: v.string()
	},
	returns: v.id('cards'),
	handler: async (ctx, args) => {
		const resolved = await resolveActiveOrganization(ctx);
		if (!resolved) throw new ConvexError('No active organization');

		const board = await ctx.db.get(args.boardId);
		if (!board || board.orgId !== resolved.organization.id) {
			throw new ConvexError('Board not found');
		}

		const cardId = await ctx.db.insert('cards', { ...args, order: 0 });

		await ctx.db.insert('activities', {
			cardId,
			boardId: args.boardId,
			type: 'created',
			actorId: resolved.session.user.id,
			createdAt: Date.now()
		});

		return cardId;
	}
});
```

## AI Features (Full Suite, All Editable)

### 1. AI Backlog Generator (Async)

- **Trigger**: User input idea (e.g., "auth for mobile app")
- **AI Output**: 3-5 stories with "As a... I want... so that..." + acceptance criteria + story points estimate
- **Manual override**: User can edit/hapus all generated items
- **Auto-create**: Cards created in Product Backlog as draft

### 2. AI Sprint Planning (Async)

- **Trigger**: Before sprint, user clicks "AI Plan Sprint"
- **AI Input**: Velocity history, sprint capacity, backlog items, dependencies
- **AI Output**: Recommended cards for sprint (+ reasoning), risk flag per card, sprint goal suggestion
- **Manual override**: User can add/remove cards, edit sprint goal

### 3. AI Board Assistant (Async + real-time)

- **Column suggestion**: When activity on card (PR linked, test passed), AI suggests column move
- **Blocker detection**: AI scans comments, detects blocker keywords, shows badge
- **WIP warning**: AI counts cards per column, alerts if over limit
- **Manual override**: All suggestions are dismissible, user drags cards manually

### 4. AI Estimation (Async)

- AI reads card description -> recommends story points (1/2/3/5/8/13) + reasoning
- Planning Poker mode: AI as "player" with estimate + justification
- **Manual override**: User can override any AI estimate

### 5. AI Search & Analytics (Streaming chat + async insights)

- **Natural language search**: "find all urgent bugs in sprint 3 not done"
- **Burndown insights**: AI analyzes chart -> generates text insights
- **Anomaly detection**: AI scans data -> highlights unusual patterns
- **Manual override**: Search results same as manual filter, just different input method

### 6. AI Retrospective (Async)

- After sprint ends, AI generates retro board:
  - "What went well" (from completed cards on time)
  - "What didn't go well" (overdue, blocked, scope changes)
  - "Action items" (improvement recommendations)
- Pattern detection across sprints: "team always over-commits in week 2"
- **Manual override**: User edits/adds all retro items

### 7. AI Chat Assistant (Streaming)

- Chat panel in board sidebar, context-aware:
  - "What's the team velocity for last 3 sprints?"
  - "Which cards are most at risk this sprint?"
  - "Write acceptance criteria for card X"
- Streaming response real-time via Convex HTTP endpoint + SSE
- Informational only - does not auto-modify data

## AI-Assisted, Human-Controlled Principle

| Feature         | Manual Mode                     | AI Mode                       | AI Output                      |
| --------------- | ------------------------------- | ----------------------------- | ------------------------------ |
| Backlog         | User creates card manually      | AI generates from idea        | Editable draft, can delete all |
| Estimation      | User inputs story points        | AI recommends + reasoning     | User approves/overrides        |
| Sprint Planning | User drags cards to sprint      | AI suggests scope             | User adds/removes              |
| Retro           | User writes manually            | AI generates from sprint data | User edits/adds                |
| Search          | Filter by status/label/assignee | Natural language search       | Same results, different input  |
| Board           | User drags card between columns | AI suggests column            | User accepts/rejects           |
| Chat Assistant  | - (chat only)                   | Q&A with AI                   | Informational, no auto-changes |

**Key rules**:

1. AI output = draft, not final. Always shown as suggestion/preview before apply
2. AI never auto-executes changes. User must click "Apply" to confirm
3. Manual mode always available. AI is enhancement, not dependency
4. AI suggestion can be dismissed. "Dismiss" / "Ignore" button on every recommendation
5. All AI-generated fields are editable. No field is locked after AI generate

## Implementation Phases

### Phase 1: Data Layer (Foundation)

~8 new files

1. `src/convex/schema.ts` - 10 domain tables + compose with auth
2. `src/convex/boards.ts` - CRUD queries/mutations (org-scoped)
3. `src/convex/columns.ts` - column CRUD + reorder
4. `src/convex/cards.ts` - card CRUD, move, assign, label
5. `src/convex/sprints.ts` - sprint lifecycle
6. `src/convex/labels.ts` - label CRUD
7. `src/convex/comments.ts` - comment CRUD
8. `src/convex/activities.ts` - activity log helper

### Phase 2: Board UI (Core Scrum Board)

~12 new files

1. Route `src/routes/(app)/boards/+page.svelte` + `+page.server.ts`
2. Route `src/routes/(app)/board/[boardId]/+page.svelte` + `+page.server.ts`
3. Components: `board-view`, `board-column`, `board-card`, `card-detail-drawer`
4. Update sidebar nav (`app-sidebar.svelte`)
5. DnD integration with `@dnd-kit-svelte/svelte` (cross-column drag)

### Phase 3: Scrum Features (Sprint + Backlog)

~10 new files

1. Route `src/routes/(app)/backlog/[boardId]/` - Product Backlog view
2. Route `src/routes/(app)/sprint/[boardId]/` - Sprint view + planning
3. Components: `sprint-planning`, `burndown-chart`, `planning-poker`
4. Sprint lifecycle mutations (start/end sprint, move cards to/from sprint)
5. Story points input UI

### Phase 4: Retrospective

~4 new files

1. Route `src/routes/(app)/retro/[sprintId]/`
2. Components: `retro-board`, `retro-column`, `retro-card`
3. Retrospective CRUD functions

### Phase 5: AI Provider Layer + Settings

~8 new files

1. `src/convex/ai/types.ts` - AIProvider interface
2. `src/convex/ai/provider/openai.ts` - OpenAI adapter
3. `src/convex/ai/provider/anthropic.ts` - Anthropic adapter
4. `src/convex/ai/router.ts` - provider routing + billing integration
5. `src/convex/ai/settings.ts` - org AI settings CRUD
6. `src/convex/ai/usage.ts` - usage logging + track
7. `src/convex/ai/billing.ts` - checkBalance + trackUsage
8. Component: `ai-settings-dialog.svelte` (admin picks provider + model)
9. Install LLM packages: `pnpm add openai @anthropic-ai/sdk`

### Phase 6: AI Features (Async)

~10 new files

1. `src/convex/ai/backlog.ts` - generateBacklog action
2. `src/convex/ai/sprint.ts` - suggestSprintScope action
3. `src/convex/ai/estimation.ts` - estimateStoryPoints action
4. `src/convex/ai/retro.ts` - generateRetro action
5. `src/convex/ai/search.ts` - naturalLanguageSearch action
6. Prompts: `prompts/backlog.ts`, `sprint.ts`, `estimation.ts`, `retro.ts`, `search.ts`
7. Components: `ai-button`, `ai-suggestion-panel`, `ai-usage-badge`
8. Integrate AI buttons into existing UI (board, backlog, sprint planning, retro)

### Phase 7: AI Chat Assistant (Streaming)

~4 new files

1. `src/convex/ai/chat.ts` - streaming chat action (via HTTP endpoint)
2. `src/convex/http.ts` - add chat streaming route
3. Route `src/routes/(app)/ai-assistant/[boardId]/`
4. Components: `ai-chat-panel`, `ai-chat-message`

### Phase 8: Billing Integration & Polish

~2 new files + updates

1. Wire `billing.track` into every AI action (Phase 6-7)
2. `ai-usage-dashboard` component (shows remaining/used requests per org)
3. Update `autumn.config.ts` - rename `messages` feature to `ai_requests` (or keep as is)
4. Settings page: AI usage + model selection
5. E2E testing with Playwright

## Key Technical Decisions

| Decision           | Choice                                       | Reason                                          |
| ------------------ | -------------------------------------------- | ----------------------------------------------- |
| DnD library        | `@dnd-kit-svelte/svelte` (already installed) | No new dependency                               |
| Chart library      | Custom SVG (burndown is simple)              | Minimal JS, no new dep                          |
| LLM streaming      | Convex HTTP endpoint + SSE                   | Convex actions don't stream natively            |
| AI key storage     | Per-org in `aiSettings` (encrypted)          | Provider-agnostic                               |
| Activity log       | Auto-generated in mutations                  | Audit trail, feeds AI insights                  |
| Billing feature ID | `messages` (existing)                        | Already metered + consumable                    |
| Authz pattern      | `resolveActiveOrganization` (existing)       | Org-scoped, proven pattern                      |
| Schema composition | Spread auth tables + add domain tables       | Single schema file, follows Better Auth pattern |

## Existing Infrastructure to Reuse

| What               | Where                                                           | How                                         |
| ------------------ | --------------------------------------------------------------- | ------------------------------------------- |
| Org-scoped authz   | `src/convex/organizations.ts:121` (`resolveActiveOrganization`) | Call in every mutation/query                |
| Billing check      | `src/convex/billing.ts:182` (`check` action)                    | Check `messages` balance before AI call     |
| Billing track      | `src/convex/billing.ts:214` (`track` internal action)           | Track 1 message per AI request              |
| Autumn SDK         | `src/convex/autumn.ts`                                          | Already wraps Autumn API v2                 |
| DnD library        | `@dnd-kit-svelte/svelte`                                        | Already in package.json, used in data-table |
| Sidebar nav        | `src/lib/components/app-sidebar.svelte:47-77`                   | Replace placeholder items                   |
| Org role check     | `src/lib/organizations.ts:30` (`canManageOrganization`)         | Gate AI settings to owner/admin             |
| Convex AI pattern  | `docs/convex.md:536-757`                                        | OpenAI action pattern reference             |
| Schema composition | `src/convex/betterAuth/schema.ts`                               | Spread generated tables + add custom        |
