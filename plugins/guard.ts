import type { IncomingMessage } from "node:http";

const LOOPBACK = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?$/i;

/**
 * True for requests the local tool should answer: the Host header names this machine (so a DNS
 * rebinding page cannot reach the routes even if Vite is ever started with --host) and the
 * Origin, when a browser sends one, is the app itself. Requests without an Origin (curl, the MCP
 * server) pass: they come from a process that already has local access.
 */
export function isLocalRequest(req: IncomingMessage): boolean {
  const host = req.headers.host;
  if (!host || !LOOPBACK.test(host)) return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  return URL.parse(origin)?.host === host;
}
