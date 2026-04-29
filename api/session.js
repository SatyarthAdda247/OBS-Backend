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

import { kv } from '@vercel/kv';

const SESSION_TTL_SECONDS = 300; // 5 minutes

// In-memory fallback for local dev without KV configured
const memStore = new Map();

async function getStore() {
  // If Vercel KV env vars are present, use KV; otherwise use in-memory
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    return 'kv';
  }
  return 'mem';
}

async function sessionGet(token) {
  const store = await getStore();
  if (store === 'kv') {
    return await kv.get(`obs:session:${token}`);
  }
  return memStore.get(token) ?? null;
}

async function sessionSet(token, data) {
  const store = await getStore();
  if (store === 'kv') {
    await kv.set(`obs:session:${token}`, data, { ex: SESSION_TTL_SECONDS });
  } else {
    memStore.set(token, data);
    setTimeout(() => memStore.delete(token), SESSION_TTL_SECONDS * 1000);
  }
}

async function sessionDelete(token) {
  const store = await getStore();
  if (store === 'kv') {
    await kv.del(`obs:session:${token}`);
  } else {
    memStore.delete(token);
  }
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
