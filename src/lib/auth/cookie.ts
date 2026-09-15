import "server-only";
import { headers } from "next/headers";

/**
 * Decides whether the current request is HTTPS so we only mark cookies
 * `Secure` when they will actually be sent. Deriving this from the request
 * (not `NODE_ENV`) keeps auth working over plain http (e.g. a LAN IP or
 * `localhost`), where browsers silently drop `Secure` cookies. Behind a TLS
 * reverse proxy, honor the `x-forwarded-proto` header.
 */
export async function isHttpsRequest(): Promise<boolean> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-proto");
    if (forwarded) return forwarded.split(",")[0]?.trim().toLowerCase() === "https";
    if (h.get("x-forwarded-ssl") === "on") return true;
    return h.get("x-forwarded-scheme") === "https";
  } catch {
    return false;
  }
}