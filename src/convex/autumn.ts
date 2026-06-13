import { Autumn, AutumnError } from 'autumn-js';
import { ConvexError } from 'convex/values';

/**
 * Direct autumn-js SDK client (Autumn API v2). The `@useautumn/convex`
 * component is intentionally not used: it is pinned to the deprecated v1 API
 * and its value-add (React hooks, identify-scoped calls) doesn't apply to a
 * SvelteKit app. Every call passes an explicit `customerId` instead — the
 * active organization's id, resolved in `billing.ts`.
 *
 * This module stays free of Convex function imports so `auth.ts` and
 * `admin.ts` can use it without creating import cycles.
 */
export function getAutumn(): Autumn | null {
	const secretKey = process.env.AUTUMN_SECRET_KEY;
	if (!secretKey) return null;
	return new Autumn({ secretKey });
}

export function requireAutumn(): Autumn {
	const autumn = getAutumn();
	if (!autumn) {
		// ConvexError data reaches the client even in production (plain Error
		// messages are redacted), so the UI can show a meaningful toast.
		throw new ConvexError('Billing is not configured');
	}
	return autumn;
}

// Errors are surfaced as plain { message, code } values so action results
// stay Convex-serializable and the UI can show them directly.
export interface BillingError {
	message: string;
	code: string;
}

/**
 * The SDK throws `AutumnError` on non-2xx responses; the API's
 * `{ message, code }` payload is only available as the raw response body.
 */
export function toBillingError(error: unknown): BillingError {
	if (error instanceof AutumnError) {
		try {
			const body = JSON.parse(error.body) as { message?: string; code?: string };
			return {
				message: body.message ?? error.message,
				code: body.code ?? `http_${error.statusCode}`
			};
		} catch {
			return { message: error.message, code: `http_${error.statusCode}` };
		}
	}
	return {
		message: error instanceof Error ? error.message : String(error),
		code: 'unknown'
	};
}

/**
 * Organizations normally get their Autumn customer at creation time
 * (`afterCreateOrganization` in auth.ts), but customers created before
 * billing was configured may not have one — treat that as "no billing data"
 * rather than an error.
 */
export function isCustomerNotFound(error: unknown): boolean {
	return (
		error instanceof AutumnError &&
		error.statusCode === 404 &&
		toBillingError(error).code === 'customer_not_found'
	);
}
