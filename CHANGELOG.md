# Changelog

## 2026-06-10 — Better Auth / Convex dependency upgrade

Upgraded the auth/data stack:

- `@convex-dev/better-auth` `^0.9` → `^0.12`
- `better-auth` `1.3.x` → `~1.6.15`
- `convex` → `^1.40`
- Svelte Convex bindings moved from `convex-svelte` to `@mmailaender/convex-svelte`
  - `@mmailaender/convex-better-auth-svelte` (the integration the official
    Convex + Better Auth + SvelteKit guide now prescribes).

### ⚠️ One-time migration for EXISTING deployments (JWKS key rotation)

**Fresh clones are not affected** — a brand-new deployment generates its signing
keys with the current algorithm from the start. This only affects deployments
that were already running an older version of this template.

Across this upgrade, Better Auth switched the algorithm it uses to sign Convex
JWTs from **EdDSA to RS256**. The signing keys already stored in your Better
Auth database (the `jwks` table inside the `betterAuth` component) were generated
with the old algorithm, so the token endpoint cannot use them.

**Symptom:** users still appear signed in (the Better Auth session cookie is
valid), but every Convex query that needs an authenticated user returns `null` —
profile name/email are blank, dashboards are empty, and role-gated UI (e.g. the
admin menu) does not render. The Convex logs show:

```
H(GET /api/auth/convex/token) [ERROR] JOSENotSupported:
  Invalid or unsupported JWK "alg" (Algorithm) Parameter value (ERR_JOSE_NOT_SUPPORTED)
```

You must rotate the JWKS **once per deployment** (do it for `dev` and `prod`
separately — they have separate databases). Pick one option:

#### Option A — No code change (recommended)

1. Open the Convex dashboard for the deployment.
2. Go to **Data**, select the **`betterAuth`** component, open the **`jwks`** table.
3. Delete all rows in that table.
4. Load the app and sign in. The next token request regenerates a fresh RS256
   keypair automatically.

#### Option B — Temporary flag

1. In `src/convex/auth.ts`, set the flag on the Convex plugin:
   ```ts
   convex({ authConfig, jwksRotateOnTokenGenerationError: true }),
   ```
2. Deploy, then load the app once (the first token request deletes the old keys
   and regenerates RS256).
3. **Remove the flag** and redeploy. Do not leave it on permanently — it is a
   migration aid, not steady-state config (on any future token-signing error it
   would silently wipe and regenerate all signing keys instead of surfacing the
   problem).

**Notes**

- Rotation invalidates currently-issued Convex JWTs; clients re-fetch a valid one
  within seconds. Better Auth **sessions are not affected** — users stay signed in.
- Prefer a low-traffic window.
- There is no HTTP endpoint to trigger rotation (`rotateKeys` is `SERVER_ONLY`);
  both options above ultimately just clear the `jwks` table and let Better Auth
  regenerate keys on the configured algorithm.
