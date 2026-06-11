import { ConvexError } from 'convex/values';
import { toast } from 'svelte-sonner';

/**
 * Show an error toast. Prefers `ConvexError` data (the clean, user-facing
 * message a Convex function threw), then `error.message`, then the fallback.
 */
export function showErrorToast(error: unknown, fallback: string): void {
	if (error instanceof ConvexError && typeof error.data === 'string') {
		toast.error(error.data);
		return;
	}
	toast.error(error instanceof Error ? error.message : fallback);
}
