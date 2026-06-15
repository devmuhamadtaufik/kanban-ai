import { defineSchema } from 'convex/server';
import { tables as generatedTables } from './generatedSchema';

/**
 * Project-owned Better Auth schema composition.
 *
 * Regenerate Better Auth tables into generatedSchema.ts, then keep custom
 * indexes here so they are not overwritten by the Better Auth CLI.
 *
 * See https://labs.convex.dev/better-auth/features/local-install#adding-custom-indexes
 */
export const tables = {
	...generatedTables,
	member: generatedTables.member.index('organizationId_userId', ['organizationId', 'userId']),
	invitation: generatedTables.invitation
		.index('organizationId_status', ['organizationId', 'status'])
		.index('email_organizationId_status', ['email', 'organizationId', 'status'])
};

const schema = defineSchema(tables);

export default schema;
