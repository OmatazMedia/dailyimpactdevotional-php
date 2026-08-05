/**
 * Central API request helper.
 *
 * Every API request in the app should go through this helper so that:
 *  - the base URL is always derived from the single API_BASE constant
 *  - HTTP errors surface as descriptive ApiError instances
 *    (HTTP status + server JSON message when available)
 *  - network failures, timeouts and invalid JSON are reported clearly
 *
 * Usage:
 *   const data = await api<Devotional[]>("/devotionals.php");
 *   await api("/settings.php", { method: "PUT", body: JSON.stringify(s) });
 */

import { API_BASE } from "../config/api";

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export interface ApiRequestOptions extends RequestInit {
  timeoutMs?: number;
}

/**
 * DELETE with a graceful fallback: some shared hosts (cPanel/ModSecurity)
 * block the DELETE verb outright. The backend honors ?_method=DELETE on POST
 * (see httpMethod() in backend/config/db.php), so we retry once via POST with
 * that param when the native DELETE fails.
 */
export async function apiDelete<T = unknown>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  try {
    return await api<T>(path, { ...options, method: "DELETE" });
  } catch (err) {
    // Fall back when the server rejected the DELETE verb outright. Some shared
    // hosts (cPanel/ModSecurity) return 403/405/501 or simply drop the request
    // (status 0). The backend honors ?_method=DELETE on POST (see httpMethod()
    // in backend/config/db.php), so we retry once via POST with that param.
    // If the failure was an auth problem (401), the POST retry fails identically
    // and the real error still propagates — so widening to 403 is safe.
    const status = err instanceof ApiError ? err.status : 0;
    if (status === 403 || status === 405 || status === 501 || status === 0) {
      const sep = path.includes("?") ? "&" : "?";
      return await api<T>(`${path}${sep}_method=DELETE`, { ...options, method: "POST" });
    }
    throw err;
  }
}

/**
 * PUT with a graceful fallback: some shared hosts (cPanel/ModSecurity)
 * block the PUT verb outright. The backend honors ?_method=PUT on POST
 * (see httpMethod() in backend/config/db.php), so we retry once via POST with
 * that param when the native PUT fails.
 */
export async function apiPut<T = unknown>(path: string, body: unknown, options: ApiRequestOptions = {}): Promise<T> {
  const opts: ApiRequestOptions = {
    ...options,
    method: "PUT",
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
  try {
    return await api<T>(path, opts);
  } catch (err) {
    // Fall back when the server rejected the PUT verb outright. Same strategy
    // as apiDelete: cPanel/ModSecurity can return 403/405/501 or drop the
    // request (status 0). The backend honors ?_method=PUT on POST.
    const status = err instanceof ApiError ? err.status : 0;
    if (status === 403 || status === 405 || status === 501 || status === 0) {
      const sep = path.includes("?") ? "&" : "?";
      return await api<T>(`${path}${sep}_method=PUT`, { ...opts, method: "POST" });
    }
    throw err;
  }
}

export async function api<T = unknown>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { timeoutMs = 20000, ...fetchOptions } = options;

  // Ensure a Content-Type header is set when sending a JSON body.
  const headers = new Headers(fetchOptions.headers);
  if (
    fetchOptions.body != null &&
    typeof fetchOptions.body === "string" &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  // Forward caller-initiated aborts to our controller so both work together.
  // (Avoids AbortSignal.any(), which isn't supported in Safari < 17.4.)
  if (fetchOptions.signal) {
    fetchOptions.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  const signal = controller.signal;

  // Normalize the path: some callers embed the base URL in `path` (e.g.
  // apiPut(`${API_BASE}/settings.php`, ...)) while others pass it bare
  // (api("/settings.php")). Stripping a leading duplicate keeps both forms
  // working — without this, saves to /backend/api/backend/api/... 404 and
  // settings changes (Telegram, SMTP, payments, bank) silently never persist.
  let urlPath = path;
  if (API_BASE !== "" && urlPath.startsWith(API_BASE + "/")) {
    urlPath = urlPath.slice(API_BASE.length);
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${urlPath}`, { ...fetchOptions, headers, signal });
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === "AbortError") {
      if (fetchOptions.signal?.aborted) {
        throw new ApiError("Request aborted.", 0);
      }
      throw new ApiError(`Request timed out after ${timeoutMs / 1000}s — server did not respond.`, 0);
    }
    throw new ApiError(
      `Network error: could not reach the server (${err instanceof Error ? err.message : "unknown"}).`,
      0,
    );
  }
  clearTimeout(timeout);

  if (!res.ok) {
    let message = `Server returned HTTP ${res.status}`;
    let body: unknown;
    try {
      body = await res.json();
      if (body && typeof body === "object") {
        const obj = body as { error?: string; message?: string };
        if (typeof obj.error === "string" && obj.error) message = obj.error;
        else if (typeof obj.message === "string" && obj.message) message = obj.message;
      }
    } catch {
      message = `Server returned HTTP ${res.status} (non-JSON response).`;
    }
    throw new ApiError(message, res.status, body);
  }

  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError("Server returned invalid (non-JSON) response.", res.status);
  }
}
