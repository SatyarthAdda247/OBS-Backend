/**
 * Shared in-memory session store.
 *
 * Vercel serverless functions can share state within the same process
 * via module-level globals. This works reliably for short-lived sessions
 * (< 5 min) on Vercel's hobby tier where functions stay warm.
 *
 * For guaranteed persistence across cold starts, replace with Vercel KV:
 *   npm install @vercel/kv
 *   Then use kv.set/get/del with ex: 300 (TTL in seconds)
 */

// Use a true global so all function instances in the same process share it
if (!globalThis.__obsSessions) {
  globalThis.__obsSessions = new Map();
}

export const sessions = globalThis.__obsSessions;

export function sessionSet(token, data) {
  sessions.set(token, data);
  // Auto-expire after 5 minutes
  setTimeout(() => sessions.delete(token), 5 * 60 * 1000);
}

export function sessionGet(token) {
  return sessions.get(token) ?? null;
}

export function sessionDelete(token) {
  sessions.delete(token);
}
