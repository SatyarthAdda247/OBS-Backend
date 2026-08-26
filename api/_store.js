'use strict';

/**
 * Global Cross-Container KV Session Store for Vercel Serverless & Local Dev.
 * Backed by KVdb bucket CeA7f27ekDa87d2G7KzWJC for instant global persistence
 * across isolated serverless function containers.
 */

const BUCKET = 'CeA7f27ekDa87d2G7KzWJC';

if (!globalThis.__obsSessions) {
  globalThis.__obsSessions = new Map();
}

const sessions = globalThis.__obsSessions;

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function kvdbGet(token) {
  // 1. Try Vercel KV / Upstash if configured
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

  // 2. Try global KVdb HTTP store
  try {
    const res = await fetch(`https://kvdb.io/${BUCKET}/${token}`);
    if (res.status === 200) {
      const text = await res.text();
      return JSON.parse(text);
    }
  } catch (e) {
    console.warn("[_store] KVdb get error:", e.message || e);
  }

  return null;
}

async function kvdbSet(token, data) {
  // 1. Try Vercel KV / Upstash if configured
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

  // 2. Try global KVdb HTTP store
  try {
    const res = await fetch(`https://kvdb.io/${BUCKET}/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.ok;
  } catch (e) {
    console.warn("[_store] KVdb set error:", e.message || e);
  }

  return false;
}

async function kvdbDelete(token) {
  if (KV_URL && KV_TOKEN) {
    try {
      await fetch(`${KV_URL}/del/obs:session:${token}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
    } catch (e) {}
  }

  try {
    await fetch(`https://kvdb.io/${BUCKET}/${token}`, {
      method: 'DELETE'
    });
  } catch (e) {}
}

async function sessionSet(token, data) {
  sessions.set(token, data);
  await kvdbSet(token, data);
  setTimeout(() => sessions.delete(token), 5 * 60 * 1000);
}

async function sessionGet(token) {
  const remoteData = await kvdbGet(token);
  if (remoteData) {
    sessions.set(token, remoteData);
    return remoteData;
  }
  return sessions.get(token) ?? null;
}

async function sessionDelete(token) {
  sessions.delete(token);
  await kvdbDelete(token);
}

module.exports = {
  sessions,
  sessionSet,
  sessionGet,
  sessionDelete,
};
