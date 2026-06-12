/**
 * Client-side helpers for Better Auth organizations.
 */

interface OrganizationLike {
	// Better Auth stores metadata as a JSON string but returns it parsed in
	// some APIs; accept anything and normalize defensively.
	metadata?: unknown;
}

export function parseOrganizationMetadata(organization: OrganizationLike): Record<string, unknown> {
	const { metadata } = organization;
	if (!metadata) return {};
	if (typeof metadata === 'string') {
		try {
			return JSON.parse(metadata) as Record<string, unknown>;
		} catch {
			return {};
		}
	}
	if (typeof metadata === 'object') {
		return metadata as Record<string, unknown>;
	}
	return {};
}

/**
 * Personal organizations are created automatically on sign-up (see
 * `src/convex/auth.ts`). They serve as the default billing/workspace scope
 * for B2C use, so they can't be deleted or left.
 */
export function isPersonalOrganization(organization: OrganizationLike): boolean {
	return parseOrganizationMetadata(organization).personal === true;
}

export const organizationRoles = ['owner', 'admin', 'member'] as const;
export type OrganizationRole = (typeof organizationRoles)[number];

/** Owners and admins can manage members, invitations, and organization settings. */
export function canManageOrganization(role: string | null | undefined): boolean {
	return role === 'owner' || role === 'admin';
}

export function slugifyOrganizationName(name: string): string {
	return name
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-+|-+$)/g, '');
}
