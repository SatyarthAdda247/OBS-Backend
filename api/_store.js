'use strict';

/**
 * Shared Session Store with Vercel KV / Upstash Redis support
 */

if (!globalThis.__obsSessions) {
  globalThis.__obsSessions = new Map();
}

const sessions = globalThis.__obsSessions;

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function kvSet(token, data) {
  if (KV_URL && KV_TOKEN) {
    try {
      await fetch(`${KV_URL}/set/obs:session:${token}/${encodeURIComponent(JSON.stringify(data))}/EX/300`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
      return true;
    } catch (e) {
      console.warn("[_store] Vercel KV set error:", e.message || e);
    }
  }
  return false;
}

async function kvGet(token) {
  if (KV_URL && KV_TOKEN) {
    try {
      const res = await fetch(`${KV_URL}/get/obs:session:${token}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
      if (res.ok) {
        const json = await res.json();
        if (json.result) {
          return typeof json.result === 'string' ? JSON.parse(json.result) : json.result;
        }
      }
    } catch (e) {
      console.warn("[_store] Vercel KV get error:", e.message || e);
    }
  }
  return null;
}

async function kvDelete(token) {
  if (KV_URL && KV_TOKEN) {
    try {
      await fetch(`${KV_URL}/del/obs:session:${token}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
      return true;
    } catch (e) {
      console.warn("[_store] Vercel KV delete error:", e.message || e);
    }
  }
  return false;
}

async function sessionSet(token, data) {
  sessions.set(token, data);
  await kvSet(token, data);
  setTimeout(() => sessions.delete(token), 5 * 60 * 1000);
}

async function sessionGet(token) {
  const kvData = await kvGet(token);
  if (kvData) return kvData;
  return sessions.get(token) ?? null;
}

async function sessionDelete(token) {
  sessions.delete(token);
  await kvDelete(token);
}

module.exports = {
  sessions,
  sessionSet,
  sessionGet,
  sessionDelete,
};
