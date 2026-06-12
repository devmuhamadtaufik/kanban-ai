# Better Auth

This project uses `better-auth` for its hybrid authentication system, providing both email/password authentication and social OAuth providers (currently Google).

Instead of duplicating extensive documentation, this guide provides links to the official resources. Please refer to them for detailed setup, configuration, and API usage.

## Key Resources

When working on authentication-related tasks, always refer to these official documents to ensure you are following the correct patterns and security best practices:

- **Convex & Svelte Adapter**: This project uses a specific adapter for integrating `better-auth` with Convex and SvelteKit. The README for this adapter is a crucial resource.
  - [Better Auth - SvelteKit Convex Integration](https://labs.convex.dev/better-auth/framework-guides/sveltekit)
  - [Convex Better Auth - Local Install (needed for admin and organization plugins)](https://labs.convex.dev/better-auth/features/local-install)

- **Official Documentation**: The primary source for all `better-auth` concepts, API, and guides.
  - [Better Auth Docs - Introduction](https://www.better-auth.com/docs/introduction)

- **Email Authentication Concepts**: For a deep dive into how email/password authentication is handled.
  - [Better Auth - Email Concepts](https://github.com/better-auth/better-auth/blob/main/docs/content/docs/concepts/email.mdx)

- **Admin Plugin**: Documentation for the admin plugin functionality.
  - [Better Auth - Admin Plugin](https://www.better-auth.com/docs/plugins/admin)

- **Organization Plugin**: Documentation for organizations, members, and invitations.
  - [Better Auth - Organization Plugin](https://www.better-auth.com/docs/plugins/organization)

- **Google OAuth**: Documentation for setting up Google Sign-In.
  - [Better Auth - Google OAuth](https://www.better-auth.com/docs/authentication/google)

## Local Install & Schema Generation

This project uses the Convex Better Auth **local install** ([docs](https://labs.convex.dev/better-auth/features/local-install)). Instead of relying on the library's pre-packaged component, the Better Auth component is vendored into our own Convex project under `src/convex/betterAuth/`, so we own its schema. This is required because we use schema-extending plugins (e.g. `admin`, which adds `role`, `banned`, … to the user table) — the packaged component can't know about those fields.

Files under `src/convex/betterAuth/`:

| File               | Role                                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `convex.config.ts` | Declares the dir as a Convex component (`defineComponent('betterAuth')`). The app's `src/convex/convex.config.ts` wires it with `app.use(betterAuth)`. |
| `schema.ts`        | The Better Auth tables (`user`, `session`, `account`, `verification`, `jwks`) **including plugin-added fields**. Auto-generated — do not edit by hand. |
| `adapter.ts`       | The component's CRUD surface (`create`, `findOne`, …) via `createApi(schema, createOptions)`.                                                          |
| `auth.ts`          | A static `auth` instance used only by the CLI for schema introspection (no real Convex `ctx`).                                                         |
| `_generated/`      | Convex codegen for the component (produced by `convex dev`).                                                                                           |

### Regenerating the schema

Re-run the generator whenever you change the Better Auth plugins/config in `src/convex/auth.ts` or upgrade `better-auth` / `@convex-dev/better-auth`:

```sh
# from the project root
cd src/convex/betterAuth
npx @better-auth/cli generate --output schema.ts -y
cd -
pnpm exec prettier --write src/convex/betterAuth/schema.ts
```

Notes:

- Use `npx @better-auth/cli generate` — **not** `npx auth generate`. The `auth` binary is not installed in this project, so `npx auth` would resolve to an unrelated package. (Some generated headers suggest `npx auth`; ignore that here.)
- The CLI introspects the **installed** Better Auth instance (via `betterAuth/auth.ts`), so it emits fields matching your current `better-auth` version and plugins even if the CLI's own version differs.
- The generator does not match our Prettier style, hence the `prettier --write` step.
- `pnpm convex dev` then picks up the new `schema.ts`, regenerates `_generated/`, and pushes the migration. Commit the resulting `schema.ts` and `_generated/` changes together.

## Organizations

The template uses the Better Auth [organization plugin](https://www.better-auth.com/docs/plugins/organization) as the single tenancy primitive. Billing (Autumn) and any org-scoped app data hang off the **active organization**, never directly off the user.

### Default organization per user

Every user gets a default organization automatically on sign-up (see the `databaseHooks` in `src/convex/auth.ts`):

- `user.create.after` creates a `"<Name>'s Workspace"` organization with the user as `owner`, then backfills `activeOrganizationId` onto the sign-up session (Better Auth runs `create.after` hooks after the sign-up transaction, so the first session already exists at that point).
- `session.create.before` sets `activeOrganizationId` to the user's first membership on every subsequent sign-in.

This keeps the data model uniform: a pure B2C product just never surfaces the org UI (users stay in their default org), while B2B products get team workspaces, invitations, and roles for free. The default org is a regular organization — rename it, invite people into it, or delete it once you own another one.

### Immutable ownership

Every organization has exactly one owner, forever — its creator. This is enforced server-side via `organizationHooks` in `src/convex/auth.ts`:

- No member can be promoted to `owner`, the owner can't be demoted or removed, and owner-role invitations are rejected (`beforeAddMember`, `beforeUpdateMemberRole`, `beforeRemoveMember`, `beforeCreateInvitation`).
- Granted roles are restricted to a single canonical value (`admin` or `member`). Better Auth accepts `string | string[]` roles and stores arrays as comma-separated strings, so without this, `"owner,member"`-style values could smuggle owner permissions past equality checks; all owner checks also normalize roles (`normalizeOrganizationRoles`).
- Better Auth's own sole-owner-can't-leave rule then guarantees the owner can never leave.
- `beforeDeleteOrganization` rejects deleting **the only organization you own** (and cancels the org's Autumn subscription otherwise).

Together these guarantee every user always keeps at least one organization as their billing/data scope — no "org-less user" state is reachable. If a project needs ownership transfer, relax the `beforeUpdateMemberRole` hook; the deletion guard stays safe as long as ownership only changes by create/delete.

### Where things live

| Concern                                                        | Location                                                                      |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Plugin config, default-org + ownership hooks, invitation email | `src/convex/auth.ts`                                                          |
| Active-org resolution + reactive `getActiveOrganization` query | `src/convex/organizations.ts`                                                 |
| Client helpers (roles, slugs)                                  | `src/lib/organizations.ts`                                                    |
| Org switcher + create dialog (sidebar)                         | `src/lib/components/org-switcher.svelte`, `create-organization-dialog.svelte` |
| Org settings page (general, members, invites, danger)          | `src/routes/(app)/organization/`                                              |
| Invitation landing page                                        | `src/routes/accept-invitation/[id]/`                                          |

Client-side org CRUD goes through `authClient.organization.*` (create, setActive, inviteMember, updateMemberRole, …); reactive reads of the active organization go through the Convex query `api.organizations.getActiveOrganization`, which updates in real time when members or invitations change.

### Convex-specific gotchas

- `advanced.database.generateId: false` is required in the auth options. Convex generates document ids; without it, flows that pre-generate ids (e.g. organization invitations) fail the component's argument validation.
- Because ids are database-generated, Better Auth defaults `requireEmailVerificationOnInvitation` to `true`. The template disables it to match its relaxed `requireEmailVerification: false` default — if you enable email verification, flip both flags.
- After adding/removing Better Auth plugins, regenerate the local component schema (see below). The organization plugin adds `organization`, `member`, and `invitation` tables plus `session.activeOrganizationId`.

## Google OAuth Setup

This project has Google OAuth pre-configured. To enable it:

### 1. Create Google OAuth Credentials

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to "APIs & Services" > "Credentials"
4. Click "Create Credentials" > "OAuth client ID"
5. Choose "Web application" as the application type
6. Add authorized redirect URIs:
   - For development: `http://localhost:5173/api/auth/callback/google`
   - For production: `https://yourdomain.com/api/auth/callback/google`
7. Copy the Client ID and Client Secret

### 2. Set Environment Variables

```sh
npx convex env set GOOGLE_CLIENT_ID your_google_client_id_here
npx convex env set GOOGLE_CLIENT_SECRET your_google_client_secret_here
```

### 3. Update Authorized Redirect URIs

Make sure your redirect URI follows this pattern:

- Development: `http://localhost:5173/api/auth/callback/google`
- Production: `https://yourdomain.com/api/auth/callback/google`

The path `/api/auth/callback/google` is handled automatically by Better Auth through the SvelteKit API route.

### 4. How It Works

The Google OAuth flow is already implemented in:

- **Server**: `src/convex/auth.ts` - Contains the Google OAuth configuration in `socialProviders`
- **Client**: `src/lib/auth-client.ts` - No additional plugin needed; social auth is built-in
- **UI**: `src/lib/components/login-form.svelte` - Has the "Login with Google" button

The button in the login form calls:

```typescript
await authClient.signIn.social({
	provider: 'google',
	callbackURL: '/dashboard'
});
```

This will redirect users to Google for authentication, then back to your app.
