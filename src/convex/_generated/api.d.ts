/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activities from "../activities.js";
import type * as admin from "../admin.js";
import type * as auth from "../auth.js";
import type * as authAdapter from "../authAdapter.js";
import type * as autumn from "../autumn.js";
import type * as billing from "../billing.js";
import type * as boards from "../boards.js";
import type * as cards from "../cards.js";
import type * as columns from "../columns.js";
import type * as comments from "../comments.js";
import type * as email from "../email.js";
import type * as http from "../http.js";
import type * as labels from "../labels.js";
import type * as organizations from "../organizations.js";
import type * as sprints from "../sprints.js";
import type * as storage from "../storage.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activities: typeof activities;
  admin: typeof admin;
  auth: typeof auth;
  authAdapter: typeof authAdapter;
  autumn: typeof autumn;
  billing: typeof billing;
  boards: typeof boards;
  cards: typeof cards;
  columns: typeof columns;
  comments: typeof comments;
  email: typeof email;
  http: typeof http;
  labels: typeof labels;
  organizations: typeof organizations;
  sprints: typeof sprints;
  storage: typeof storage;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("../betterAuth/_generated/component.js").ComponentApi<"betterAuth">;
};
