'use strict';
/**
 * /api/session — OBS session management
 *
 * POST   /api/session              — OBS registers a new pairing session
 * GET    /api/session?token=<uuid> — OBS polls for pairing result
 * DELETE /api/session?token=<uuid> — OBS invalidates session on dismiss/timeout
 */

const { sessionGet, sessionSet, sessionDelete } = require('./_store.js');

module.exports = async (req, res) => {
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

    // Paired — return stream key data and channel overlay settings to OBS
    console.log(`[obs-relay] Session polled and paired: token=${token}`);
    return res.status(200).json({
      success: true,
      data: {
        streamKey: session.streamKey,
        classId: session.classId || '',
        sceneCollection: session.sceneCollection || '',
        channelName: session.channelName || '',
        tickerUrl: session.tickerUrl || '',
        tickerText: session.tickerText || '',
        tickerOrientation: session.tickerOrientation || 'horizontal',
        tickerPosition: session.tickerPosition || 'bottom',
        promoUrl: session.promoUrl || '',
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
};
