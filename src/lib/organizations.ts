/**
 * Client-side helpers for Better Auth organizations.
 *
 * Ownership is immutable in this template: every organization has exactly
 * one owner — its creator (enforced by organizationHooks in
 * `src/convex/auth.ts`). Members can therefore only hold or be assigned the
 * roles below.
 */

export const organizationRoles = ['owner', 'admin', 'member'] as const;
export type OrganizationRole = (typeof organizationRoles)[number];

/** Roles that can be granted to members; `owner` is reserved for the creator. */
export const assignableOrganizationRoles = ['admin', 'member'] as const;

/**
 * Better Auth member APIs accept `string | string[]` roles and store arrays
 * as comma-separated strings (e.g. `"owner,member"`). Always normalize before
 * inspecting roles so multi-role values can't slip past equality checks.
 */
export function normalizeOrganizationRoles(role: unknown): string[] {
	const raw = Array.isArray(role) ? role.join(',') : String(role ?? '');
	return raw
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean);
}

/** Owners and admins can manage members, invitations, and organization settings. */
export function canManageOrganization(role: string | null | undefined): boolean {
	const roles = normalizeOrganizationRoles(role);
	return roles.includes('owner') || roles.includes('admin');
}

export function slugifyOrganizationName(name: string): string {
	return name
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-+|-+$)/g, '');
}
