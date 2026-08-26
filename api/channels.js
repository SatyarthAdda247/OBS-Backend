import { channels, toOverlay, resolveMediaUrl, isDriveFolder, applyCors } from '../lib/rules.js';

/**
 * GET /api/channels list every rule
 * GET /api/channels?streamKey=... lookup by key
 * GET /api/channels?channelName=... lookup by name
 * GET /api/channels?id=... lookup by id
 *
 * Read-only by design: Vercel's filesystem is read-only and functions are
 * stateless, so there is nowhere to persist a write.
 */
function decorate(channel) {
  return Object.assign({}, channel, {
    resolvedTickerUrl: resolveMediaUrl(channel.tickerUrl),
    resolvedPromoUrl: resolveMediaUrl(channel.promoUrl),
    unstreamable: isDriveFolder(channel.tickerUrl) || isDriveFolder(channel.promoUrl),
    overlay: toOverlay(channel),
  });
}

export default function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({
      success: false,
      error: 'This endpoint is read-only. Edit data/channels.json and redeploy.',
    });
    return;
  }

  const q = req.query || {};
  if (q.streamKey) {
    const hit = channels.find((c) => c.streamKey === String(q.streamKey).trim());
    res.status(200).json({ success: true, data: hit ? decorate(hit) : null });
    return;
  }

  if (q.channelName) {
    const needle = String(q.channelName).trim().toLowerCase();
    const hit = channels.find((c) => String(c.channelName).toLowerCase() === needle);
    res.status(200).json({ success: true, data: hit ? decorate(hit) : null });
    return;
  }

  if (q.id) {
    const hit = channels.find((c) => String(c.id) === String(q.id));
    if (!hit) {
      res.status(404).json({ success: false, error: 'No such channel' });
      return;
    }
    res.status(200).json({ success: true, data: decorate(hit) });
    return;
  }

  const all = channels.map(decorate);
  res.status(200).json({ success: true, data: all, count: all.length });
}
