// Tag definitions for support-forum auto-tagging. Pure data and helpers with no Convex imports, so both the Convex
// functions (tags.ts) and the bot process (/tags command) can use them.
export type Definition = { tag: string | null; when: string };

// `tag` is the forum tag name to apply (null: apply nothing). `when` is exactly what Jev reads, so keep it tight.
export const POST_TYPES: Record<string, Definition> = {
  bug_report: {
    tag: "Bug Report",
    when: "Something that should work is failing: an error message, crash, wrong result, or regression.",
  },
  feature_request: {
    tag: "Feature Request",
    when: "Asks for something Convex doesn't offer yet: a new capability, option, region, or client library.",
  },
  advice: {
    tag: "Advice",
    when: "Asks how to do something or which approach is best. Nothing is broken.",
  },
  none: {
    tag: null,
    when: "Not a support question: praise, an announcement, or chatter with no problem described.",
  },
};

export const POST_AREAS: Record<string, Definition> = {
  billing: {
    tag: "Billing",
    when: "Plans, upgrades, payment methods, invoices, pricing, or usage charges.",
  },
  deployment: {
    tag: "Deployment",
    when: "Deploying or running a project: convex dev or deploy, environments, preview deployments, CI, env vars.",
  },
  functions: {
    tag: "Functions",
    when: "Writing or running queries, mutations, actions, HTTP actions, crons, scheduling, or runtime limits.",
  },
  schema_data: {
    tag: "Schema & Data",
    when: "Schemas, validators, indexes, data modeling, migrations, importing or exporting data.",
  },
  performance: {
    tag: "Performance",
    when: "Slowness, high bandwidth or function usage, hitting limits, or scaling.",
  },
  self_hosting: {
    tag: "Self-hosting",
    when: "Running the open-source backend on your own infrastructure.",
  },
  clients: {
    tag: "Clients & Frameworks",
    when: "Client libraries and frameworks: React, Next.js, Expo, Svelte, or another language's client.",
  },
  dashboard: {
    tag: "Dashboard",
    when: "The Convex dashboard UI: data browser, logs, settings pages.",
  },
  auth: {
    tag: "Auth",
    when: "Authentication and authorization: Clerk, Auth0, custom auth, JWTs, user identity.",
  },
  component: {
    tag: "component",
    when: "Convex components and their packages, such as rate limiter, agent, or workflow.",
  },
  chef: { tag: "chef", when: "Chef, Convex's AI app builder." },
  other: {
    tag: "Other",
    when: "A real support question that fits none of the areas above.",
  },
};

/** "Schema & Data" and "📊 schema-data" compare equal. */
export const normalize = (name: string) =>
  name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
