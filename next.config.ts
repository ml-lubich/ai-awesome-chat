import type { NextConfig } from "next"

/** Minimal, portable config — no workspace-root or multi-origin dev quirks
 *  from the source portfolio. Anything host-specific belongs in the
 *  deploying project, not in this template. If Next warns about an
 *  inferred workspace root (e.g. a sibling repo's lockfile one directory
 *  up), set `turbopack.root` here to this project's own directory. */
const nextConfig: NextConfig = {
    poweredByHeader: false,
    reactStrictMode: true,
    typescript: {
        ignoreBuildErrors: false,
    },
}

export default nextConfig
