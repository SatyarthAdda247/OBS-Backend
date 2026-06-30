/**
 * /api/session — OBS session management
 *
 * POST   /api/session              — OBS registers a new pairing session
 * GET    /api/session?token=<uuid> — OBS polls for pairing result
 * DELETE /api/session?token=<uuid> — OBS invalidates session on dismiss/timeout
 *
 * Storage: Vercel KV (Redis-backed, free tier).
 * Falls back to in-memory if KV env vars are not set (local dev only).
 */

import Redis from 'ioredis';
import { sessionGet as memGet, sessionSet as memSet, sessionDelete as memDelete } from './_store.js';
const SESSION_TTL_SECONDS = 300; // 5 minutes
const BUCKET = 'KYmSZ3Yy8SEusEDofqzWy6';
const REDIS_URL = process.env.REDIS_URL || 'redis://default:YplziO9FvjTQ0vjDz6qeuTO9uR1Cs8Aj@meridian-sharp-lush-20498.db.redis.io:18536';
const redis = new Redis(REDIS_URL);

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

async function kvdbDelete(token) {
  try {
    await fetch(`https://kvdb.io/${BUCKET}/${token}`, {
      method: 'DELETE'
    });
    return true;
  } catch (e) {
    console.error("KVdb.io delete error:", e.message || e);
  }
  return false;
}

async function sessionGet(token) {
  // 1. Try Redis
  try {
    const dataStr = await redis.get(`obs:session:${token}`);
    if (dataStr) return JSON.parse(dataStr);
  } catch (e) {
    console.warn("Redis get error:", e.message || e);
  }

  // 2. Try KVdb.io
  const kvdbData = await kvdbGet(token);
  if (kvdbData) return kvdbData;

  // 3. Try In-memory fallback
  return memGet(token);
}

async function sessionSet(token, data) {
  // 1. Try Redis
  try {
    await redis.set(`obs:session:${token}`, JSON.stringify(data), 'EX', SESSION_TTL_SECONDS);
    return;
  } catch (e) {
    console.warn("Redis set error:", e.message || e);
  }

  // 2. Try KVdb.io
  const kvdbOk = await kvdbSet(token, data);
  if (kvdbOk) return;

  // 3. Try In-memory fallback
  memSet(token, data);
}

async function sessionDelete(token) {
  // 1. Try Redis
  try {
    await redis.del(`obs:session:${token}`);
    return;
  } catch (e) {
    console.warn("Redis delete error:", e.message || e);
  }

  // 2. Try KVdb.io
  const kvdbOk = await kvdbDelete(token);
  if (kvdbOk) return;

  // 3. Try In-memory fallback
  memDelete(token);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-auth-token');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── POST: OBS registers a new session ──────────────────────────────
  if (req.method === 'POST') {
    const { token, facultyId } = req.body || {};
    if (!token) {
      return res.status(400).json({ success: false, message: 'token required' });
    }

    await sessionSet(token, { status: 'pending', facultyId: facultyId || '', createdAt: Date.now() });

    const host = req.headers.host || 'obs-relay.vercel.app';
    const protocol = host.startsWith('localhost') ? 'http' : 'https';
    const pairUrl = `${protocol}://${host}/api/pair?token=${token}`;

    console.log(`[obs-relay] Session registered: token=${token} facultyId=${facultyId}`);

    return res.status(200).json({
      success: true,
      data: { pairUrl },
    });
  }

  // ── GET: OBS polls for pairing result ──────────────────────────────
  if (req.method === 'GET') {
    const { token } = req.query;
    if (!token) {
      return res.status(400).json({ success: false, message: 'token required' });
    }

    const session = await sessionGet(token);
    if (!session) {
      return res.status(200).json({ success: false }); // expired or never existed
    }

    if (session.status === 'pending') {
      return res.status(200).json({ success: true, data: null }); // still waiting
    }

    // Paired — return stream key data to OBS
    console.log(`[obs-relay] Session polled and paired: token=${token}`);
    return res.status(200).json({
      success: true,
      data: {
        streamKey: session.streamKey,
        classId: session.classId || '',
        sceneCollection: session.sceneCollection || '',
      },
    });
  }

  // ── DELETE: OBS invalidates session ────────────────────────────────
  if (req.method === 'DELETE') {
    const { token } = req.query;
    if (token) {
      await sessionDelete(token);
      console.log(`[obs-relay] Session invalidated: token=${token}`);
    }
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' });
}
