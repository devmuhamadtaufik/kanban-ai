import { createClient, type GenericCtx } from '@convex-dev/better-auth';
import { convex } from '@convex-dev/better-auth/plugins';
import { components } from './_generated/api';
import { type DataModel } from './_generated/dataModel';
import { query } from './_generated/server';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { APIError } from 'better-auth/api';
import { admin, organization } from 'better-auth/plugins';
import { Autumn } from 'autumn-js';
import authSchema from './betterAuth/schema';
import authConfig from './auth.config';
import { actionEmailHtml, escapeHtml, sendEmail } from './email';
import { siteConfig } from '../lib/config';
import { isPersonalOrganization, slugifyOrganizationName } from '../lib/organizations';

const siteUrl = process.env.SITE_URL!;

// The component client has methods needed for integrating Convex with Better Auth,
// as well as helper methods for general use.
export const authComponent = createClient<DataModel, typeof authSchema>(components.betterAuth, {
	local: {
		schema: authSchema
	}
});

/**
 * Every user gets a personal organization on sign-up. This keeps the data
 * model uniform: billing and app data always hang off an organization, so
 * the same template works for B2C (users stay in their personal org) and
 * B2B (users create or join shared organizations).
 */
const createPersonalOrganization = async (
	ctx: GenericCtx<DataModel>,
	user: { id: string; name?: string | null; email: string }
) => {
	const auth = createAuth(ctx);
	const slugBase = slugifyOrganizationName(user.name || user.email.split('@')[0]) || 'workspace';
	return await auth.api.createOrganization({
		body: {
			name: user.name ? `${user.name}'s Workspace` : 'Personal Workspace',
			slug: `${slugBase}-${crypto.randomUUID().slice(0, 8)}`,
			metadata: { personal: true },
			// Server-side call: create the organization on behalf of the new user.
			userId: user.id
		}
	});
};

// Plain options factory — used both by `betterAuth()` at runtime and by
// `createApi()` in the component adapter so it can introspect the schema.

export const createOptions = (ctx: GenericCtx<DataModel>) =>
	({
		baseURL: siteUrl,
		database: authComponent.adapter(ctx),
		advanced: {
			database: {
				// Convex generates document ids; without this, flows that generate
				// ids up front (e.g. organization invitations) fail validation.
				generateId: false
			}
		},
		// User configuration
		user: {
			changeEmail: {
				enabled: true,
				sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
					await sendEmail({
						to: user.email,
						subject: 'Approve email change',
						html: actionEmailHtml({
							greeting: `Hello ${escapeHtml(user.name ?? 'there')},`,
							bodyLines: [
								`We received a request to change your email address to <strong>${escapeHtml(newEmail)}</strong>.`,
								'Click the button below to approve this change:'
							],
							ctaLabel: 'Approve Email Change',
							ctaUrl: url,
							footerLine:
								"If you didn't request this change, please ignore this email or contact support."
						})
					});
				}
			}
		},
		// Configure simple, non-verified email/password to get started
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: false,
			// Send password reset emails via Resend
			sendResetPassword: async ({ user, url }) => {
				await sendEmail({
					to: user.email,
					subject: 'Reset your password',
					html: actionEmailHtml({
						greeting: `Hello ${escapeHtml(user.name ?? 'there')},`,
						bodyLines: [
							'We received a request to reset your password. Click the button below to set a new password:'
						],
						ctaLabel: 'Reset Password',
						ctaUrl: url,
						footerLine: "If you didn't request this, you can safely ignore this email."
					})
				});
			}
		},
		socialProviders: {
			...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
				? {
						google: {
							clientId: process.env.GOOGLE_CLIENT_ID,
							clientSecret: process.env.GOOGLE_CLIENT_SECRET
						}
					}
				: {})
		},
		databaseHooks: {
			user: {
				create: {
					after: async (user, hookCtx) => {
						try {
							const organization = await createPersonalOrganization(ctx, user);
							// `create.after` hooks run after the sign-up transaction, so the
							// first session already exists by now — backfill its active
							// organization (the `session.create.before` hook below covers
							// all subsequent sign-ins).
							if (organization && hookCtx) {
								await hookCtx.context.adapter.updateMany({
									model: 'session',
									where: [{ field: 'userId', value: user.id }],
									update: { activeOrganizationId: organization.id }
								});
							}
						} catch (e) {
							// Don't fail sign-up if organization creation fails; the user
							// can still create an organization manually.
							console.error('Failed to create personal organization:', e);
						}
					}
				}
			},
			session: {
				create: {
					// Sessions always start with an active organization so that
					// org-scoped queries and billing have an unambiguous context.
					before: async (session, hookCtx) => {
						if (session.activeOrganizationId || !hookCtx) return;
						const membership = await hookCtx.context.adapter.findOne<{
							organizationId: string;
						}>({
							model: 'member',
							where: [{ field: 'userId', value: session.userId }]
						});
						if (!membership) return;
						return {
							data: { ...session, activeOrganizationId: membership.organizationId }
						};
					}
				}
			}
		},
		plugins: [
			// The Convex plugin is required for Convex compatibility
			convex({ authConfig }),
			// Admin plugin for roles/impersonation/banning APIs
			admin(),
			// Organizations with invitations; billing is scoped to the active organization
			organization({
				invitationExpiresIn: 60 * 60 * 24 * 7, // 7 days
				// The template ships with email verification disabled; if you enable
				// `requireEmailVerification` above, flip this to true as well so only
				// verified addresses can view and accept invitations.
				requireEmailVerificationOnInvitation: false,
				organizationHooks: {
					beforeDeleteOrganization: async ({ organization }) => {
						// The personal workspace is the fallback billing/data scope for
						// every user, so it can never be deleted. The UI hides the
						// option, but the public API must enforce it too.
						if (isPersonalOrganization(organization)) {
							throw new APIError('BAD_REQUEST', {
								message: 'Personal workspaces cannot be deleted'
							});
						}
						// Clean up billing before the organization disappears. Failing
						// here aborts the deletion rather than orphaning a paid
						// subscription.
						const secretKey = process.env.AUTUMN_SECRET_KEY;
						if (!secretKey) return;
						const autumn = new Autumn({ secretKey });
						const { error } = await autumn.customers.delete(organization.id);
						if (error && error.code !== 'customer_not_found') {
							console.error('Failed to delete Autumn customer:', error);
							throw new APIError('INTERNAL_SERVER_ERROR', {
								message: "Failed to cancel the organization's subscription"
							});
						}
					}
				},
				sendInvitationEmail: async (data) => {
					await sendEmail({
						to: data.email,
						subject: `Join ${data.organization.name} on ${siteConfig.name}`,
						html: actionEmailHtml({
							greeting: 'Hello,',
							bodyLines: [
								`<strong>${escapeHtml(data.inviter.user.name || data.inviter.user.email)}</strong> has invited you to join <strong>${escapeHtml(data.organization.name)}</strong>.`,
								'This invitation expires in 7 days.'
							],
							ctaLabel: 'Accept Invitation',
							ctaUrl: `${siteUrl}/accept-invitation/${data.id}`,
							footerLine:
								"If you weren't expecting this invitation, you can safely ignore this email."
						})
					});
				}
			})
		]
	}) satisfies BetterAuthOptions;

export const createAuth = (ctx: GenericCtx<DataModel>, { optionsOnly } = { optionsOnly: false }) =>
	betterAuth({
		// disable logging when createAuth is called just to generate options.
		// this is not required, but there's a lot of noise in logs without it.
		logger: { disabled: optionsOnly },
		...createOptions(ctx)
	});

// Example function for getting the current user
// Feel free to edit, omit, etc.
export const getCurrentUser = query({
	args: {},
	handler: async (ctx) => {
		try {
			return await authComponent.getAuthUser(ctx);
		} catch {
			// Return null when unauthenticated
			return null;
		}
	}
});
