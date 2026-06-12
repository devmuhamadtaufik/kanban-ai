# Autumn Integration Guidelines

## Overview

Autumn is a billing and subscription management platform that integrates with Stripe. This guide covers how to use Autumn in a SvelteKit + Convex application.

## Setup

### 1. Installation

```bash
pnpm add autumn-js@^0.1.85 @useautumn/convex@^0.0.23
pnpm add -D atmn
```

`@useautumn/convex` currently requires `autumn-js@^0.1.24`; do not upgrade the runtime SDK
to `1.x` until the Convex package supports it.

### 2. Initialize Autumn

Initialize Autumn to create the configuration file:

```bash
pnpm dlx atmn init
```

This creates `autumn.config.ts` in your project root where you'll define products.

### 3. Environment Configuration

Set your Autumn secret key in Convex:

```bash
pnpm dlx convex env set AUTUMN_SECRET_KEY=am_sk_xxx
```

### 4. Convex Configuration

Register the Autumn component alongside Better Auth:

```typescript
import { defineApp } from 'convex/server';
import betterAuth from './betterAuth/convex.config';
import autumn from '@useautumn/convex/convex.config';

const app = defineApp();
app.use(betterAuth);
app.use(autumn);

export default app;
```

### 5. Autumn Client Setup

Create `convex/autumn.ts` to initialize the component client and define customer identification:

```typescript
import { components } from './_generated/api';
import { Autumn } from '@useautumn/convex';
import { type GenericCtx } from '@convex-dev/better-auth';
import { type DataModel } from './_generated/dataModel';
import { resolveActiveOrganization } from './organizations';

export const autumn = new Autumn(components.autumn, {
	secretKey: process.env.AUTUMN_SECRET_KEY ?? '',
	identify: async (ctx: GenericCtx<DataModel>) => {
		try {
			const resolved = await resolveActiveOrganization(ctx);
			if (!resolved) return null;

			return {
				customerId: resolved.organization.id,
				customerData: {
					name: resolved.organization.name,
					email: resolved.session.user.email
				}
			};
		} catch {
			return null;
		}
	}
});

export const { track, check, usage, query, listProducts } = autumn.api();
```

**Key Points:**

- The `identify` function maps the **active organization** to the Autumn customer
- Use the Better Auth organization `id` as the `customerId`; the subscription follows the organization, so all members share it and switching organizations switches the billing context
- Every user has a personal organization (auto-created on sign-up), and every organization provisions an Autumn customer in the Better Auth `afterCreateOrganization` hook
- Configure the free plan with `autoEnable: true` so new customers start on the free tier automatically
- Catch authentication errors gracefully - unauthenticated users can still view products
- Only expose member-safe API methods publicly; subscription-mutating operations are wrapped in `billing.ts` actions that require the `owner` or `admin` organization role

## Product Configuration

### 1. Define Products

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

### 2. Push Products to Autumn

```bash
pnpm dlx atmn push
```

This syncs your plans to Autumn's sandbox environment.

## Creating Billing Functions

Create `convex/billing.ts` to wrap Autumn functions:

```typescript
import { action } from './_generated/server';
import { v } from 'convex/values';
import { autumn } from './autumn';
import { resolveActiveOrganization } from './organizations';

// Re-export listProducts as-is.
export { listProducts } from './autumn';

async function ensureCustomer(ctx, resolved) {
	const customer = {
		id: resolved.organization.id,
		name: resolved.organization.name,
		email: resolved.session.user.email
	};
	const created = await autumn.customers.create(ctx, customer);
	if (!created.error) return;

	const updated = await autumn.customers.update(ctx, {
		name: customer.name,
		email: customer.email
	});
	if (updated.error) throw updated.error;
}

// Wrapper for checkout that ensures the customer exists first.
export const checkout = action({
	args: { productId: v.string() },
	handler: async (ctx, args) => {
		const resolved = await resolveActiveOrganization(ctx);
		if (!resolved) throw new Error('No active organization');
		await ensureCustomer(ctx, resolved);
		return await autumn.checkout(ctx, { productId: args.productId });
	}
});

// Wrapper for billing portal that ensures the customer exists first.
export const billingPortal = action({
	args: {},
	handler: async (ctx) => {
		const resolved = await resolveActiveOrganization(ctx);
		if (!resolved) throw new Error('No active organization');
		await ensureCustomer(ctx, resolved);
		return await autumn.customers.billingPortal(ctx, {});
	}
});
```

**Important:**

- Organizations create their Autumn customer in Better Auth's `afterCreateOrganization` hook, so billing page reads do not need a repair/create call
- Keep an idempotent customer guard before checkout, billing portal, and future feature `check`/`track` wrappers
- The current Convex wrapper exposes `customers.create` and `customers.update`; use the create-then-update fallback as the idempotent guard
- Mark the free plan with `autoEnable: true` so Autumn grants the free tier when the customer is created

## Frontend Integration

### Loading Products

```typescript
import { useConvexClient } from '@mmailaender/convex-svelte';
import { api } from '$convex/_generated/api.js';
import { onMount } from 'svelte';

const client = useConvexClient();
let products = $state<Product[]>([]);

onMount(async () => {
	try {
		const result = await client.action(api.billing.listProducts, {});
		if (result?.data?.list) {
			products = result.data.list;
		}
	} catch (error) {
		console.error('Error loading products:', error);
	}
});
```

**Key Points:**

- Products are returned in `result.data.list`, not `result.data`
- `listProducts` doesn't require authentication
- Products contain `items` array with pricing and feature information

### Checkout Flow

```typescript
async function handleCheckout(productId: string) {
	try {
		const result = await client.action(api.billing.checkout, { productId });
		if (result?.data?.url) {
			window.location.href = result.data.url;
		}
	} catch (error) {
		console.error('Checkout error:', error);
	}
}
```

### Billing Portal

```typescript
async function handleManageSubscription() {
	try {
		const result = await client.action(api.billing.billingPortal, {});
		if (result?.data?.url) {
			window.location.href = result.data.url;
		}
	} catch (error) {
		console.error('Billing portal error:', error);
	}
}
```

## Data Structure

### Product Object

```typescript
interface Product {
	id: string;
	name: string;
	items?: Array<{
		type?: 'feature' | 'priced_feature' | 'price';
		price?: number;
		interval?: string;
		feature_id?: string;
		included_usage?: number | 'inf';
	}>;
}
```

This is the runtime response shape from the compatible `autumn-js@0.1.x` SDK. The
camelCase `plan`/`item` shape in `autumn.config.ts` is only the `atmn` configuration API.

### Response Format

Autumn API responses follow this structure:

```typescript
{
	data: any | null;
	error: AutumnError | null;
	statusCode?: number;
}
```

## Common Patterns

### Parsing Product Data

```typescript
// Map products to display format
let plans = $derived<Plan[]>(
	Array.isArray(products)
		? products.map((product) => {
				const priceItem = product.items?.find((item) => item.type === 'price');
				const featureItem = product.items?.find((item) => item.feature_id === 'messages');

				return {
					id: product.id,
					name: product.name,
					price: priceItem?.price || 0,
					interval: priceItem?.interval || 'month',
					features: [`${featureItem?.included_usage || 0} messages per month`]
				};
			})
		: []
);
```

### Feature Access Control

```typescript
import { api } from './_generated/api';

// Check if user has access to a feature
export const canAccessFeature = action({
	args: { featureId: v.string() },
	handler: async (ctx, { featureId }) => {
		const result = await ctx.runAction(api.autumn.check, { featureId });
		return result?.data?.allowed || false;
	}
});

// Track feature usage
export const trackUsage = action({
	args: { featureId: v.string() },
	handler: async (ctx, { featureId }) => {
		await ctx.runAction(api.autumn.track, { featureId });
	}
});
```

## Best Practices

1. **Customer Creation**: Provision the Autumn customer when the Better Auth organization is created; keep create-then-update guards before checkout, billing portal, feature checks, and usage tracking
2. **Error Handling**: Wrap Autumn calls in try-catch blocks and handle errors gracefully
3. **Authentication**: Use the component `identify` hook to map the active Better Auth organization to `customerId`
4. **Product IDs**: Use consistent product IDs between `autumn.config.ts` and your frontend
5. **Testing**: Use Autumn's sandbox environment for development and testing
6. **Type Safety**: Define TypeScript interfaces for products and responses

## Resources

- [Autumn Documentation](https://docs.useautumn.com)
- [Autumn Setup Guide](https://docs.useautumn.com/setup.md)
- [Autumn Convex Integration](https://docs.useautumn.com/setup/convex)
- [Better Auth Autumn Plugin (with React and without Convex)](https://www.better-auth.com/docs/plugins/autumn)
