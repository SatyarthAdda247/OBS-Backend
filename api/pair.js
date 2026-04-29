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

const memStore = new Map();

async function getStore() {
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
    await kv.set(`obs:session:${token}`, data, { ex: 300 });
  } else {
    memStore.set(token, data);
  }
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
