'use strict';
/**
 * /api/pair?token=<uuid> — Mobile app sends stream key after scanning QR
 *
 * POST /api/pair?token=<uuid>
 * Body: { "streamKey": "live_xxx", "classId": "988036", "sceneCollection": "Lecture" }
 */

const { sessionGet, sessionSet } = require('./_store.js');
const { resolveRule } = require('../lib/rules');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-auth-token, x-jwt-token, authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', message: 'Method not allowed' });
  }

  const token = req.query?.token || req.body?.token;
  if (!token) {
    return res.status(400).json({ status: 'error', message: 'token required' });
  }

  const session = await sessionGet(token);
  if (!session) {
    console.warn(`[api/pair] Session not found or expired for token: ${token}`);
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

  console.log(`[obs-relay] Pairing successful: token=${token} classId=${classId} streamKey=${streamKey}`);

  return res.status(200).json({ status: 'ok' });
};
