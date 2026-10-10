export const DEFAULT_WHEN: Record<string, string> = {
  bugreport:
    "Something that should work is failing: an error message, crash, wrong result, or regression.",
  featurerequest:
    "Asks for something Convex doesn't offer yet: a new capability, option, region, or client library.",
  advice:
    "Asks how to do something or which approach is best. Nothing is broken.",
  billing:
    "Plans, upgrades, payment methods, invoices, pricing, or usage charges.",
  deployment:
    "Deploying or running a project: convex dev or deploy, environments, preview deployments, CI, env vars.",
  functions:
    "Writing or running queries, mutations, actions, HTTP actions, crons, scheduling, or runtime limits.",
  schemadata:
    "Schemas, validators, indexes, data modeling, migrations, importing or exporting data.",
  performance:
    "Slowness, high bandwidth or function usage, hitting limits, or scaling.",
  selfhosting: "Running the open-source backend on your own infrastructure.",
  clientsframeworks:
    "Client libraries and frameworks: React, Next.js, Expo, Svelte, or another language's client.",
  dashboard: "The Convex dashboard UI: data browser, logs, settings pages.",
  auth: "Authentication and authorization: Clerk, Auth0, custom auth, JWTs, user identity.",
  component:
    "Convex components and their packages, such as rate limiter, agent, or workflow.",
  chef: "Chef, Convex's AI app builder.",
  other: "A real support question that fits none of the other tags.",
};

const NEVER_AUTO_TAG = ["resolved", "closed", "duplicate"];
export const isTopicTag = (tag: { name: string }) =>
  !NEVER_AUTO_TAG.includes(normalize(tag.name));

export const MAX_APPLIED_TAGS = 5;

/** "Schema & Data" and "📊 schema-data" compare equal. */
export const normalize = (name: string) =>
  name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
