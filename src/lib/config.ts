/**
 * Project-level site configuration — edit this file when starting a new
 * project from this template. It feeds page titles, the sidebar brand,
 * transactional email subjects/senders, and landing-page links.
 *
 * Rules to keep this maintainable:
 * - Nothing secret and nothing per-environment: values that differ between
 *   dev and prod (SITE_URL, EMAIL_FROM, API keys) belong in env vars.
 * - No behavior flags: feature toggles live next to the feature they control.
 * - Keep it dependency-free: the Convex backend imports this file too
 *   (`../lib/config`), so it must not pull in browser or SvelteKit modules.
 */
export const siteConfig = {
	name: 'ModernStack SaaS',
	description:
		'A modern, open source SaaS starter built with SvelteKit, Convex, Better Auth, Autumn, and Tailwind CSS.',
	links: {
		github: 'https://github.com/joachimchauvet/modernstack-saas'
	}
} as const;
