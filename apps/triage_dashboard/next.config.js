const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: "../../.env.local" });

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The app imports TypeScript from packages/db, so Turbopack must see the whole repo as the workspace root.
  turbopack: { root: path.join(__dirname, "../..") },
};

module.exports = nextConfig;
