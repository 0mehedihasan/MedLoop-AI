/**
 * MedLoop AI — the only module that performs HTTP.
 *
 * Responsibilities, and nothing else: build the URL, attach the bearer token, parse the response,
 * and turn every failure into an {@link ApiError} carrying a `code` from `types/api.ts`. No feature
 * code constructs a URL, reads `fetch` or inspects a status number.
 *
 * ## Token storage
 *
 * The token lives in `sessionStorage`, not `localStorage`. Both are readable by any script on the
 * origin, so neither is a defence against XSS; the difference is lifetime — `sessionStorage` dies
 * with the tab, so a shared laptop does not keep a valid credential on disk indefinitely. The real
 * fix is an `HttpOnly; SameSite=Strict` cookie issued by FastAPI, which is recorded here as the
 * upgrade seam: it needs a backend change, so it is not something this file can do alone.
 *
 * Reads are guarded for `typeof window` because App Router modules are evaluated on the server.
 */

import { API_BASE_URL } from './env';
import { ApiErrorCode, NETWORK_ERROR_CODE } from '@/types/api';
import type { ApiErrorEnvelope } from '@/types/api';

const TOKEN_KEY = 'medloop.token';

/** Every failure the client can produce, including transport ones, as one throwable. */
export class ApiError extends Error {
  readonly code: ApiErrorCode | typeof NETWORK_ERROR_CODE;
  readonly status: number | null;
  readonly details: Readonly<Record<string, unknown>> | null;

  constructor(
    code: ApiErrorCode | typeof NETWORK_ERROR_CODE,
    message: string,
    status: number | null = null,
    details: Readonly<Record<string, unknown>> | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  /** True when nothing answered on the port — a different problem from "the API said no". */
  get isNetworkError(): boolean {
    return this.code === NETWORK_ERROR_CODE;
  }
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Token
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(TOKEN_KEY);
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Query serialisation
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export type QueryValue = string | number | boolean | readonly (string | number)[] | undefined | null;
export type Query = Readonly<Record<string, QueryValue>>;

/**
 * `undefined` and `null` are **omitted**, never sent as empty strings — an empty filter must mean
 * "no constraint", and `?label_code=` would otherwise ask the server to match the empty label.
 *
 * Arrays join with `,` because that is the form the contract specifies (`?model_ids=1,2,3`).
 */
function buildQuery(query: Query | undefined): string {
  if (query === undefined) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      params.set(key, value.join(','));
      continue;
    }
    params.set(key, String(value));
  }
  const serialised = params.toString();
  return serialised === '' ? '' : `?${serialised}`;
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Request
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface RequestOptions {
  readonly query?: Query;
  readonly signal?: AbortSignal;
  /** Set for `/auth/login`, which must not send a stale `Authorization` header. */
  readonly anonymous?: boolean;
}

function isErrorEnvelope(value: unknown): value is ApiErrorEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = (value as { error?: unknown }).error;
  if (typeof candidate !== 'object' || candidate === null) return false;
  return typeof (candidate as { code?: unknown }).code === 'string';
}

/**
 * Map a non-2xx response onto an {@link ApiError}. A body that is *not* the documented envelope —
 * an HTML error page, say — becomes `INTERNAL_ERROR` with the status attached, rather than being
 * reported as one of the domain codes it never actually claimed.
 */
async function toApiError(response: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (isErrorEnvelope(body)) {
    const { code, message, details } = body.error;
    return new ApiError(code, message, response.status, details ?? null);
  }
  return new ApiError(
    ApiErrorCode.INTERNAL_ERROR,
    `${response.status} ${response.statusText || 'Request failed'}`,
    response.status,
    null,
  );
}

async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (options.anonymous !== true) {
    const token = getToken();
    if (token !== null) headers.Authorization = `Bearer ${token}`;
  }

  const url = `${API_BASE_URL}${path}${buildQuery(options.query)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: options.signal,
      // Local-only app on a fixed origin; a credentialled cross-origin request is never wanted.
      credentials: 'omit',
      cache: 'no-store',
    });
  } catch (cause) {
    // An abort is the caller's own doing — rethrow it so React can discard the render, not report
    // it as "the backend is unreachable".
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError(
      NETWORK_ERROR_CODE,
      `Cannot reach the MedLoop API at ${API_BASE_URL}. Is the backend running?`,
      null,
      { url },
    );
  }

  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError(
      ApiErrorCode.INTERNAL_ERROR,
      'The API returned a success status with an unreadable body.',
      response.status,
      { url },
    );
  }
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Verbs
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export const http = {
  get: <T>(path: string, options?: RequestOptions): Promise<T> =>
    request<T>('GET', path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> =>
    request<T>('POST', path, body ?? {}, options),
  put: <T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> =>
    request<T>('PUT', path, body ?? {}, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> =>
    request<T>('PATCH', path, body ?? {}, options),
  delete: <T>(path: string, options?: RequestOptions): Promise<T> =>
    request<T>('DELETE', path, undefined, options),
} as const;

/**
 * Absolute URL for a binary artefact — image bytes, a Grad-CAM PNG. These go straight into `src`
 * attributes rather than through `fetch`, so they are built here to keep {@link API_BASE_URL} the
 * single origin in the codebase.
 *
 * The bearer token cannot ride along on an `<img>` request. Byte endpoints therefore have to accept
 * the session another way; until the backend exists that is an open item, and it is recorded rather
 * than papered over with a query-string token, which would land the credential in the server log.
 */
export function artifactUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

