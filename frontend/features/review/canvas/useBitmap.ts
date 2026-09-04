'use client';

/**
 * MedLoop AI — `useBitmap`: fetches image bytes and reports what actually came back.
 *
 * Two consumers — the image layer and the Grad-CAM layer — both need three facts before they can
 * render anything: whether the bytes exist, what the natural pixel dimensions are, and whether the
 * request merely *failed* as opposed to the artefact not existing at all.
 *
 * ## Five states, because "missing" and "failed" are different facts (§2.3)
 *
 * A `404` means the artefact was never produced: no Grad-CAM has been computed for this image, because
 * no model exists. That removes the Grad-CAM view from the switcher. A `500`, or a dead API, means the
 * artefact may well exist and we could not read it — which is an error to show, not a view to hide.
 * Collapsing the two would either hide a real failure or advertise a feature as broken.
 *
 * ## Why `fetch` rather than putting the URL straight into `href`
 *
 * A bearer token cannot ride on an `<img>`/`<image>` request, and a query-string token would land the
 * credential in the server's access log. Fetching the bytes with the `Authorization` header and handing
 * the layer a blob URL keeps the credential in the header where it belongs — and, as a side effect,
 * gives us the HTTP status, which an `onError` handler never reveals.
 *
 * ## The blob URL is revoked when it is replaced, not in the effect's cleanup
 *
 * Cleanup runs *before* the next effect body, so revoking there frees a URL that the previous render's
 * `<image>` is still pointing at. Instead the URL a component currently holds lives in a ref, is
 * revoked at the moment its successor is installed, and is revoked once more on unmount.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { getToken } from '@/lib/api-client';
import type { PixelSize } from '@/types/domain';

export type BitmapStatus = 'idle' | 'loading' | 'ready' | 'missing' | 'error';

export interface Bitmap {
  readonly status: BitmapStatus;
  /** Blob URL for `<image href>`, only ever set while `status === 'ready'`. */
  readonly href: string | null;
  /** Natural dimensions, the denominator for every normalised coordinate on this image (§4.3). */
  readonly size: PixelSize | null;
  /** Annotator-facing prose. Set only when `status === 'error'`. */
  readonly problem: string | null;
  readonly retry: () => void;
}

interface BitmapState {
  readonly status: BitmapStatus;
  readonly href: string | null;
  readonly size: PixelSize | null;
  readonly problem: string | null;
}

const IDLE: BitmapState = { status: 'idle', href: null, size: null, problem: null };
const LOADING: BitmapState = { status: 'loading', href: null, size: null, problem: null };

/** Decodes a blob URL far enough to read its natural size. Rejects when the bytes are not an image. */
function measure(href: string): Promise<PixelSize> {
  return new Promise<PixelSize>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve({ w: image.naturalWidth, h: image.naturalHeight });
    };
    image.onerror = () => {
      reject(new Error('decode'));
    };
    image.src = href;
  });
}

export function useBitmap(url: string | null): Bitmap {
  const [state, setState] = useState<BitmapState>(url === null ? IDLE : LOADING);
  const [nonce, setNonce] = useState(0);

  // The blob URL this hook currently owns. Replaced and revoked together; see the header.
  const heldRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (heldRef.current !== null) URL.revokeObjectURL(heldRef.current);
      heldRef.current = null;
    },
    [],
  );

  const install = useCallback((next: BitmapState): void => {
    const previous = heldRef.current;
    heldRef.current = next.href;
    setState(next);
    if (previous !== null && previous !== next.href) URL.revokeObjectURL(previous);
  }, []);

  const retry = useCallback((): void => {
    setNonce((current) => current + 1);
  }, []);
