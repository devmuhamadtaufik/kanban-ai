import { createAuth } from '../auth';

// Static instance for Better Auth schema generation
// (the CLI doesn't have a real Convex ctx, so we pass a stub).
export const auth = createAuth({} as never);
