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
