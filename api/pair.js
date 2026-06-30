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

import Redis from 'ioredis';
import { sessionGet as memGet, sessionSet as memSet } from './_store.js';

const BUCKET = 'KYmSZ3Yy8SEusEDofqzWy6';
const REDIS_URL = process.env.REDIS_URL || 'redis://default:YplziO9FvjTQ0vjDz6qeuTO9uR1Cs8Aj@meridian-sharp-lush-20498.db.redis.io:18536';
const redis = new Redis(REDIS_URL);

async function sessionGet(token) {
  // 1. Try Redis
  try {
    const dataStr = await redis.get(`obs:session:${token}`);
    if (dataStr) return JSON.parse(dataStr);
  } catch (e) {
    console.warn("Redis get error:", e.message || e);
  }

  // 2. Try In-memory fallback
  return memGet(token);
}

async function sessionSet(token, data) {
  // 1. Try Redis
  try {
    await redis.set(`obs:session:${token}`, JSON.stringify(data), 'EX', 300);
    return;
  } catch (e) {
    console.warn("Redis set error:", e.message || e);
  }

  // 2. Try In-memory fallback
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
