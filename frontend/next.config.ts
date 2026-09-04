import type { NextConfig } from 'next';

/**
 * MedLoop AI — Next.js configuration.
 *
 * Two things here are load-bearing rather than boilerplate:
 *
 * 1. The Content-Security-Policy is how CLAUDE.md §2.1 ("medical images never leave the
 *    machine") is enforced *in the browser* rather than only by convention. `connect-src`
 *    and `img-src` list `'self'` and the local API origin and nothing else, so a dependency
 *    that tries to phone home fails visibly at the network layer instead of succeeding
 *    quietly. If a request ever fails with no useful error, check this list first — a CSP
 *    refusal looks exactly like a dead server.
 *
 * 2. `images.unoptimized` is deliberate. Next's optimizer re-encodes and resizes; a
 *    reviewer must annotate the bytes the model saw, not a transcode of them. Clinical
 *    images are rendered with a plain `<img>` throughout for the same reason.
 */

/** The API origin the browser is allowed to talk to. Derived once, used by the CSP. */
function apiOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8000/api/v1';
  try {
    return new URL(configured).origin;
  } catch {
    // A malformed value must not silently produce a CSP that blocks every request.
    throw new Error(
      `NEXT_PUBLIC_API_BASE_URL is not a valid absolute URL: ${JSON.stringify(configured)}`,
    );
  }
}

const isDev = process.env.NODE_ENV !== 'production';
const api = apiOrigin();

/**
 * `'unsafe-inline'` on script-src is required because Next injects inline bootstrap and
 * flight-data scripts and this app does not run a nonce-emitting middleware. `'unsafe-eval'`
 * and the websocket origins are dev-only (react-refresh / HMR) and are absent in production.
 */
const csp = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' blob: data: ${api}`,
  `font-src 'self' data:`,
  `connect-src 'self' ${api}${isDev ? ' ws://localhost:3000 ws://127.0.0.1:3000' : ''}`,
  `media-src 'self' ${api}`,
  `worker-src 'self' blob:`,
  `manifest-src 'self'`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `frame-ancestors 'none'`,
].join('; ');

/**
 * Turbopack infers the workspace root by walking up for a lockfile, and there is an unrelated
 * `package-lock.json` in the parent directory of this repository, outside it. Pinning the root to
 * this directory keeps module resolution inside `frontend/` and silences that warning without
 * touching a file that does not belong to the project.
 *
 * `typeof __dirname` is safe whichever module format Next compiles this config to — on an
 * undeclared identifier `typeof` yields `'undefined'` rather than throwing.
 */
const projectRoot = typeof __dirname === 'string' ? __dirname : process.cwd();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  turbopack: { root: projectRoot },

  // Never ship a build that skipped its own checks (CLAUDE.md §12). Next 16 removed the `eslint`
  // config key — lint is a separate step (`npm run lint`) and is listed in §12 as its own command.
  typescript: { ignoreBuildErrors: false },

  images: { unoptimized: true },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
