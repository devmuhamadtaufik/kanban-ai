import type { FunctionReturnType } from 'convex/server';
import type { api } from '$convex/_generated/api';

/** Shape returned by `api.organizations.getActiveOrganization`. */
export type ActiveOrganization = NonNullable<
	FunctionReturnType<typeof api.organizations.getActiveOrganization>
>;

export type OrganizationMember = ActiveOrganization['members'][number];
export type OrganizationInvitation = ActiveOrganization['invitations'][number];
