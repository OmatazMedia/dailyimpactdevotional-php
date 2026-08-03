/**
 * Central API base URL configuration.
 *
 * Defaults to "/backend/api" for same-domain cPanel deployments (the React build
 * and the PHP API are served from the same domain; the PHP endpoints live in the
 * backend/api/ folder). Optional override via VITE_API_URL for cross-origin
 * setups — set it to a relative path (e.g. "/backend/api") or an absolute origin
 * (e.g. "https://api.example.com").
 *
 * Every request in the app must be built from this constant — never hardcode
 * API URLs in components.
 */

const envBase: string | undefined = (import.meta.env.VITE_API_URL as string | undefined)?.trim();

export const API_BASE: string = envBase ? envBase.replace(/\/+$/, "") : "/backend/api";
