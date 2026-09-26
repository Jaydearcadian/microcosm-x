import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // `next dev` and `next build` both default to `.next`. When the e2e suite
  // starts a dev server in this same directory it overwrites the production
  // build, and the running `next start` then serves HTML whose asset hashes no
  // longer exist on disk, so every stylesheet and chunk 400s and the deployed
  // app renders unstyled. Pointing the dev server at its own distDir keeps the
  // two from ever touching the same output.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // apps/charcoal is a standalone app nested in the Microcosm monorepo; pin
  // the tracing root so Next.js doesn't infer the wrong workspace root from
  // stray lockfiles.
  outputFileTracingRoot: __dirname,
  // Same-origin transport for the deployed app. The frozen REST/SSE API stays
  // unchanged; this only lets browser calls cross the tunnel without CORS
  // assumptions. Local dev can set NEXT_PUBLIC_MICROCOSM_API=http://localhost:8787.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${process.env.MICROCOSM_API_PROXY ?? "http://52.40.133.66:8791"}/api/:path*` }];
  },
};

export default nextConfig;
