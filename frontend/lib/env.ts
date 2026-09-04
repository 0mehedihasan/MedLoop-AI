/**
 * MedLoop AI — the only module that reads `process.env`.
 *
 * Next.js inlines `NEXT_PUBLIC_*` at build time, so a typo produces `undefined` in the browser with
 * no error. Reading each variable exactly once, here, with a validation that throws, converts that
 * silent failure into a loud one — and gives `next.config.ts` a single place to agree with.
 *
 * Non-negotiable: no value here may point off this machine. CLAUDE.md §2.1 makes that a defect, and
 * the CSP built in `next.config.ts` from the same variable will refuse the request anyway.
 */

/** `demo` renders the §10 fixtures behind a banner; `api` removes all of them. No third value. */
export type DataSource = 'demo' | 'api';

function requireAbsoluteUrl(value: string | undefined, name: string, fallback: string): string {
  const raw = value ?? fallback;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${name} must be an absolute URL. Received: ${JSON.stringify(raw)}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${name} must be http(s). Received protocol: ${parsed.protocol}`);
  }
  // Trailing slashes make every joined path ambiguous; strip once, here.
  return raw.replace(/\/+$/, '');
}

function readDataSource(value: string | undefined): DataSource {
  if (value === 'api') return 'api';
  if (value === 'demo' || value === undefined) return 'demo';
  throw new Error(`NEXT_PUBLIC_DATA_SOURCE must be "demo" or "api". Received: ${JSON.stringify(value)}`);
}

export const API_BASE_URL = requireAbsoluteUrl(
  process.env.NEXT_PUBLIC_API_BASE_URL,
  'NEXT_PUBLIC_API_BASE_URL',
  'http://127.0.0.1:8000/api/v1',
);

export const DATA_SOURCE: DataSource = readDataSource(process.env.NEXT_PUBLIC_DATA_SOURCE);

/** True while the app is allowed to render marked demo fixtures (§10). */
export const IS_DEMO = DATA_SOURCE === 'demo';

export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0-dev';
