import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/**
 * Validate a post-auth redirect target against open redirects. Only
 * same-origin absolute paths are allowed: the value must start with a single
 * `/` and not be protocol-relative — browsers resolve both `//host` and
 * `/\host` as external URLs, so both are rejected.
 */
export function normalizeRedirect(
	path: string | null | undefined,
	fallback = '/dashboard'
): string {
	return path && /^\/(?![/\\])/.test(path) ? path : fallback;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, 'child'> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, 'children'> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };
