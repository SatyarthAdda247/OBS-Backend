'use strict';
/**
 * /api/pair?token=<uuid> — Mobile app sends stream key after scanning QR
 *
 * POST /api/pair?token=<uuid>
 * Body: { "streamKey": "live_xxx", "classId": "988036", "sceneCollection": "Lecture" }
 */

const Redis = require('ioredis');
const { sessionGet: memGet, sessionSet: memSet } = require('./_store.js');
const { resolveRule } = require('../lib/rules');

const REDIS_URL = process.env.REDIS_URL || 'redis://default:YplziO9FvjTQ0vjDz6qeuTO9uR1Cs8Aj@meridian-sharp-lush-20498.db.redis.io:18536';
const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
redis.on('error', () => {});

async function sessionGet(token) {
  try {
    const dataStr = await redis.get(`obs:session:${token}`);
    if (dataStr) return JSON.parse(dataStr);
  } catch (e) {
    console.warn("Redis get error:", e.message || e);
  }
  return memGet(token);
}

async function sessionSet(token, data) {
  try {
    await redis.set(`obs:session:${token}`, JSON.stringify(data), 'EX', 300);
    return;
  } catch (e) {
    console.warn("Redis set error:", e.message || e);
  }
  memSet(token, data);
}

module.exports = async (req, res) => {
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

  const { streamKey, classId, sceneCollection, channelName, channelId } = req.body || {};
  if (!streamKey) {
    return res.status(400).json({ status: 'error', message: 'streamKey required' });
  }

  const activeChannel = channelName || channelId || '';
  const resolved = resolveRule({ channelName: activeChannel, streamKey });
  const channelRule = resolved.overlay;

  await sessionSet(token, {
    status: 'paired',
    streamKey,
    classId: classId || '',
    sceneCollection: sceneCollection || '',
    channelName: activeChannel,
    tickerUrl: channelRule?.tickerUrl || '',
    tickerText: channelRule?.tickerText || '',
    tickerOrientation: channelRule?.tickerOrientation || 'horizontal',
    tickerPosition: channelRule?.tickerPosition || 'bottom',
    promoUrl: channelRule?.promoUrl || '',
    pairedAt: Date.now(),
  });

  console.log(`[obs-relay] Pairing received: token=${token} classId=${classId} channelName=${activeChannel}`);

  return res.status(200).json({ status: 'ok' });
};
