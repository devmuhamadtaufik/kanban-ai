# Autumn Integration Guidelines

## Overview

Autumn is a billing and subscription management platform that integrates with Stripe. This guide covers how to use Autumn in a SvelteKit + Convex application.

The template uses the `autumn-js` SDK (v1.x, Autumn API v2) directly from Convex actions. The `@useautumn/convex` component is intentionally **not** used: it is pinned to the deprecated v1 API (`autumn-js@0.1.x`), and its main value-add — React hooks and identify-scoped calls — doesn't apply to a SvelteKit app. Every call passes an explicit `customerId` instead. The SDK is fetch-based and runs in Convex's default runtime (no `"use node"` needed).

## Setup

### 1. Installation

```bash
pnpm add autumn-js
pnpm add -D atmn
```

### 2. Initialize Autumn

Initialize Autumn to create the configuration file:

```bash
pnpm dlx atmn init
```

This creates `autumn.config.ts` in your project root where you'll define plans.

### 3. Environment Configuration

Set your Autumn secret key in Convex:

```bash
pnpm dlx convex env set AUTUMN_SECRET_KEY=am_sk_xxx
```

### 4. SDK Client Setup

`convex/autumn.ts` is a small leaf module (no Convex function imports, so `auth.ts` and `admin.ts` can use it without import cycles) that provides:

- `getAutumn()` — returns an `Autumn` client, or `null` when `AUTUMN_SECRET_KEY` isn't configured (billing-optional flows like organization hooks skip silently)
- `requireAutumn()` — same, but throws a `ConvexError` for flows that need billing
- `toBillingError(error)` — maps thrown `AutumnError`s to plain `{ message, code }` values (the API's error payload only exists as the raw response body on the thrown error)
- `isCustomerNotFound(error)` — 404 check, used to treat missing customers as "no billing data" rather than an error

```typescript
import { Autumn, AutumnError } from 'autumn-js';

export function getAutumn(): Autumn | null {
	const secretKey = process.env.AUTUMN_SECRET_KEY;
	if (!secretKey) return null;
	return new Autumn({ secretKey });
}
```

**Key points:**

- The SDK **throws** `AutumnError` on non-2xx responses (unlike `autumn-js@0.1.x`, which returned `{ data, error }`). Billing actions catch and convert errors to Convex-serializable `{ message, code }` values so the UI can show them in toasts.
- SDK responses are **camelCase** (`paymentUrl`, `featureId`, `price.amount`); the wire API is snake_case but the SDK maps it.

## Organization-Scoped Billing

Billing is scoped to the **active organization**, not the user. Every user gets a personal organization on sign-up, so the same model works for B2C (personal org = the customer) and B2B (shared org = the customer).

- The Better Auth organization `id` is the Autumn `customerId`; the subscription follows the organization, so all members share it and switching organizations switches the billing context
- Every organization provisions an Autumn customer in the Better Auth `afterCreateOrganization` hook via `customers.getOrCreate` (idempotent); `beforeDeleteOrganization` deletes the customer with `deleteInStripe: true` — required because Autumn's delete does not touch Stripe on its own, and deleting the Stripe customer is what cancels any active subscription
- Configure the free plan with `autoEnable: true` so new customers start on the free tier automatically
- `convex/billing.ts` resolves the active organization on every call (`identifyBillingCustomer`) and passes `customerId` explicitly — there is no identify hook
- Reads (`getCustomer`, `check`) are member-safe; subscription-mutating operations (`attach`, `billingPortal`) require the `owner` or `admin` organization role (`requireBillingManager`); `track` is an internal action so clients can never write usage directly
- Admin cross-organization reads (`admin.ts: getOrganizationBilling`) use the same client with the target organization's id as `customerId`

## Product Configuration

### 1. Define Plans

Create `autumn.config.ts` in the project root:

```typescript
import { feature, item, plan } from 'atmn';

// Define Features
export const messages = feature({
	id: 'messages',
	name: 'Messages',
	type: 'metered',
	consumable: true
});

// Define Plans
export const freePlan = plan({
	id: 'free_plan',
	name: 'Free Plan',
	autoEnable: true,
	items: [
		item({
			featureId: messages.id,
			included: 5,
			reset: {
				interval: 'month'
			}
		})
	]
});

export const pro = plan({
	id: 'pro',
	name: 'Pro',
	price: {
		amount: 20,
		interval: 'month'
	},
	items: [
		item({
			featureId: messages.id,
			included: 100,
			reset: {
				interval: 'month'
			}
		})
	]
});
```

### 2. Push Plans to Autumn

```bash
pnpm dlx atmn push
```

This syncs your plans to Autumn's sandbox environment.

## Billing Functions

`convex/billing.ts` wraps the SDK in Convex actions. All of them return `{ data, error }` envelopes (`error` is `null` or `{ message, code }`) so results stay Convex-serializable.

| Action          | SDK call                                 | Access                           |
| --------------- | ---------------------------------------- | -------------------------------- |
| `listPlans`     | `autumn.plans.list()`                    | public                           |
| `getCustomer`   | `autumn.customers.getOrCreate(...)`      | organization members             |
| `check`         | `autumn.check(...)`                      | organization members (read-only) |
| `track`         | `autumn.track(...)`                      | internal (server-side code only) |
| `attach`        | `autumn.billing.attach(...)`             | owners/admins                    |
| `billingPortal` | `autumn.billing.openCustomerPortal(...)` | owners/admins                    |

```typescript
export const attach = action({
	args: { planId: v.string() },
	returns: billingResultValidator,
	handler: async (ctx, args) => {
		const customer = await requireBillingManager(ctx);
		try {
			const autumn = requireAutumn();
			const data = await withCustomerRecovery(autumn, customer, () =>
				autumn.billing.attach({
					customerId: customer.customerId,
					planId: args.planId,
					redirectMode: 'if_required'
				})
			);
			return { data, error: null };
		} catch (error) {
			return { data: null, error: toBillingError(error) };
		}
	}
});
```

**Important:**

- `attach` replaces v1's `checkout` and handles new subscriptions, upgrades and downgrades. With `redirectMode: 'if_required'` it returns a `paymentUrl` only when the customer must complete payment through Stripe checkout; plan changes that need no payment input apply immediately and return `paymentUrl: null` — the UI must handle both cases.
- Billing is self-healing: organizations get their customer at creation time, but that hook only logs failures, so `getCustomer` uses `customers.getOrCreate` and the other calls retry once through `withCustomerRecovery` (provision via `getOrCreate` on `customer_not_found`, then retry).
- Never expose raw `track` (or `check` with `sendEvent`) to clients — a member could consume or, with negative values, mint the organization's balance. `track` is an `internalAction`; call it from trusted server-side code after the feature action actually happened.

## Frontend Integration

The billing page loads plans and customer state once in `+page.server.ts` and calls billing actions from the client.

### Loading Plans and Customer State

```typescript
// +page.server.ts
const [plansResult, customerResult] = await Promise.all([
	client.action(api.billing.listPlans, {}),
	client.action(api.billing.getCustomer, {})
]);

return {
	plans: plansResult?.data?.list || [],
	customerData: customerResult || null
};
```

**Key points:**

- Plans are returned in `result.data.list`, typed by `ListPlansList` from `autumn-js`
- `listPlans` doesn't require authentication
- The customer's active plans are in `customer.subscriptions` (status `'active' | 'scheduled'`); the auto-enabled free plan shows up there too

### Attach (Checkout) Flow

```typescript
async function handleAttach(planId: string) {
	const result = await client.action(api.billing.attach, { planId });
	if (result?.error) throw new Error(result.error.message);
	if (result?.data?.paymentUrl) {
		window.location.href = result.data.paymentUrl;
	} else {
		// Plan changes that need no payment input apply immediately
		await invalidateAll();
	}
}
```

### Billing Portal

```typescript
async function handleManageSubscription() {
	const result = await client.action(api.billing.billingPortal, {});
	if (result?.error) throw new Error(result.error.message);
	if (result?.data?.url) {
		window.location.href = result.data.url;
	}
}
```

## Data Structures (SDK v1.x, camelCase)

### Plan (from `plans.list`)

```typescript
interface ListPlansList {
	id: string;
	name: string;
	autoEnable: boolean;
	price: { amount: number; interval: string } | null; // null for free plans
	items: Array<{
		featureId: string;
		included: number;
		unlimited: boolean;
		reset: { interval: string } | null;
		price: object | null; // usage pricing beyond included units
	}>;
}
```

### Customer (from `customers.getOrCreate`)

```typescript
interface Customer {
	id: string | null;
	name: string | null;
	email: string | null;
	stripeId: string | null;
	subscriptions: Array<{
		planId: string;
		status: 'active' | 'scheduled';
		plan?: { name: string };
		currentPeriodEnd: number | null;
		canceledAt: number | null;
	}>;
	purchases: Array<object>; // one-time purchases
	balances: Record<string, { granted: number; remaining: number; usage: number }>;
	flags: Record<string, { enabled: boolean }>; // boolean features
}
```

## Feature Access Control

```typescript
// Gate a feature inside a trusted server-side action
const result = await ctx.runAction(api.billing.check, { featureId: 'messages' });
if (!result?.data?.allowed) throw new ConvexError('Message limit reached');

// ... perform the feature action, then record the usage (internal action —
// clients cannot call it directly)
await ctx.runAction(internal.billing.track, { featureId: 'messages' });
```

## Best Practices

1. **Customer Creation**: Provision the Autumn customer when the Better Auth organization is created; keep the `withCustomerRecovery` retry around billing calls so a failed hook self-heals
2. **Error Handling**: The SDK throws — always catch and map with `toBillingError` inside actions so errors reach the UI as serializable values
3. **Authorization**: Resolve the active organization server-side on every billing call; never accept a `customerId` from the client (except in admin-gated functions)
4. **Plan IDs**: Use consistent plan IDs between `autumn.config.ts` and `api.billing.attach` calls
5. **Testing**: Use Autumn's sandbox environment for development and testing
6. **Type Safety**: Use the types exported by `autumn-js` (`Customer`, `ListPlansList`, `AutumnError`) instead of hand-written interfaces

## Resources

- [Autumn Documentation](https://docs.useautumn.com)
- [Setup and payments](https://docs.useautumn.com/documentation/getting-started/setup.md)
- [Checking and tracking](https://docs.useautumn.com/documentation/getting-started/gating.md)
- [API Reference](https://docs.useautumn.com/api-reference) (v2 API; the SDK maps snake_case wire format to camelCase)
