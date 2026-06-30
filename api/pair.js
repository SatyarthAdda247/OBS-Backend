/**
 * /api/pair?token=<uuid> — Mobile app sends stream key after scanning QR
 *
 * POST /api/pair?token=<uuid>
 * Body: { "streamKey": "live_xxx", "classId": "988036", "sceneCollection": "Lecture" }
 *
 * Response 200: { "status": "ok" }
 * Response 403: { "status": "error", "message": "invalid or expired token" }
 * Response 400: { "status": "error", "message": "streamKey required" }
 */

import { kv } from '@vercel/kv';
import { sessionGet as memGet, sessionSet as memSet } from './_store.js';

const BUCKET = 'KYmSZ3Yy8SEusEDofqzWy6';

async function kvdbGet(token) {
  try {
    const res = await fetch(`https://kvdb.io/${BUCKET}/${token}`);
    if (res.status === 200) {
      return await res.json();
    }
  } catch (e) {
    console.error("KVdb.io get error:", e.message || e);
  }
  return null;
}

async function kvdbSet(token, data) {
  try {
    const res = await fetch(`https://kvdb.io/${BUCKET}/${token}`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return res.ok;
  } catch (e) {
    console.error("KVdb.io set error:", e.message || e);
  }
  return false;
}

async function sessionGet(token) {
  // 1. Try Vercel KV
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      const data = await kv.get(`obs:session:${token}`);
      if (data) return data;
    } catch (e) {
      console.warn("Vercel KV get error:", e.message || e);
    }
  }

  // 2. Try KVdb.io
  const kvdbData = await kvdbGet(token);
  if (kvdbData) return kvdbData;

  // 3. Try In-memory fallback
  return memGet(token);
}

async function sessionSet(token, data) {
  // 1. Try Vercel KV
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      await kv.set(`obs:session:${token}`, data, { ex: 300 });
      return;
    } catch (e) {
      console.warn("Vercel KV set error:", e.message || e);
    }
  }

  // 2. Try KVdb.io
  const kvdbOk = await kvdbSet(token, data);
  if (kvdbOk) return;

  // 3. Try In-memory fallback
  memSet(token, data);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', message: 'Method not allowed' });
  }

  const { token } = req.query;
  if (!token) {
    return res.status(400).json({ status: 'error', message: 'token required' });
  }

  const session = await sessionGet(token);
  if (!session) {
    return res.status(403).json({ status: 'error', message: 'invalid or expired token' });
  }

  const { streamKey, classId, sceneCollection } = req.body || {};
  if (!streamKey) {
    return res.status(400).json({ status: 'error', message: 'streamKey required' });
  }

  // Update session with pairing data — OBS will pick it up on next poll
  await sessionSet(token, {
    status: 'paired',
    streamKey,
    classId: classId || '',
    sceneCollection: sceneCollection || '',
    pairedAt: Date.now(),
  });

  console.log(`[obs-relay] Pairing received: token=${token} classId=${classId}`);

  return res.status(200).json({ status: 'ok' });
}
