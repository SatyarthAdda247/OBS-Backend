import { resolveRule, applyCors, readJsonBody } from '../lib/rules.js';

/**
 * POST /api/resolve { streamKey?, title?, channelName? }
 * GET /api/resolve?title=...&streamKey=...
 *
 * Pure lookup — no session state, nothing written.
 * Pairing (/api/session, /api/pair) is untouched.
 */
export default function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    res.status(405).json({ success: false, error: `${req.method} not allowed on /api/resolve` });
    return;
  }

  const src = req.method === 'GET' ? req.query || {} : readJsonBody(req);
  const streamKey = String(src.streamKey || '').trim();
  const channelName = String(src.channelName || '').trim();
  const title = String(src.title || '').trim();

  if (!streamKey && !channelName && !title) {
    res.status(400).json({ success: false, error: 'streamKey, title or channelName is required' });
    return;
  }

  const { matchedBy, channel, overlay, titleMatch } = resolveRule({ streamKey, channelName, title });

  // Shows up in Vercel function logs
  console.log(
    `[resolve] matchedBy=${matchedBy} key="${streamKey}" title="${title}" -> "${overlay.channelName}" ` +
    `(${overlay.tickerOrientation}/${overlay.tickerPosition})`
  );

  res.status(200).json({
    success: true,
    data: {
      matchedBy,
      matchedChannelId: channel ? channel.id : null,
      titleMatch: titleMatch || null,
      overlay: Object.assign({ streamKey }, overlay),
    },
  });
}
