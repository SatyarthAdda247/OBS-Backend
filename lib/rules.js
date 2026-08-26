import channelsData from '../data/channels.json' assert { type: 'json' };

export const channels = channelsData;

// ───────────────────────── media URLs ─────────────────────────
const DRIVE_FILE_RE = /drive\.google\.com\/file\/d\/([A-Za-z0-9_-]{10,})/;
const DRIVE_ID_RE = /drive\.google\.com\/[^\s]*[?&]id=([A-Za-z0-9_-]{10,})/;
const DRIVE_BARE_D_RE = /drive\.google\.com\/d\/([A-Za-z0-9_-]{10,})/;
const DRIVE_FOLDER_RE = /drive\.google\.com\/drive\/folders\//;

export function isUrl(value) {
  return /^https?:\/\//i.test(String(value == null ? '' : value).trim());
}

export function isDriveFolder(value) {
  return DRIVE_FOLDER_RE.test(String(value == null ? '' : value));
}

/** Google Drive share link -> direct download link OBS can stream. */
export function resolveMediaUrl(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw || !isUrl(raw)) return raw;
  if (isDriveFolder(raw)) return raw; // a folder is not a single file

  const m = raw.match(DRIVE_FILE_RE) || raw.match(DRIVE_ID_RE) || raw.match(DRIVE_BARE_D_RE);
  if (m) return `https://drive.google.com/uc?export=download&id=${m[1]}`;
  return raw; // S3 / CloudFront already direct
}

// ───────────────────────── lookups ─────────────────────────
export function pickBest(matches) {
  if (!matches.length) return null;
  return matches.find((c) => c.status === 'active') || matches[0];
}

export function findByStreamKey(streamKey) {
  const needle = String(streamKey || '').trim();
  if (!needle) return null;
  return pickBest(channels.filter((c) => c.streamKey === needle));
}

export function findByChannelName(channelName) {
  const needle = String(channelName || '').trim().toLowerCase();
  if (!needle) return null;
  return pickBest(channels.filter((c) => String(c.channelName).toLowerCase() === needle));
}

// ─────────────────── title -> exam vertical ───────────────────
export const TITLE_STOPWORDS = new Set([
  'adda', 'adda247', '247', 'live', 'class', 'classes', 'session', 'sessions',
  'batch', 'promo', 'all', 'channel', 'channels', 'special', 'event', 'the',
  'and', 'for', 'with', 'mam', 'sir', 'ki', 'mai', 'maine', 'run', 'hoga', 'day',
  'part', 'new',
]);

export const MIN_TITLE_MATCH_RATIO = 0.6;

export function tokenize(value) {
  return String(value == null ? '' : value)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function significantTokens(channelName) {
  const all = tokenize(channelName);
  const significant = all.filter((t) => !TITLE_STOPWORDS.has(t) && !/^\d+$/.test(t));
  return significant.length ? significant : all;
}

export function isBetterTitleMatch(a, b) {
  if (a.matchedCount !== b.matchedCount) return a.matchedCount > b.matchedCount;
  if (a.ratio !== b.ratio) return a.ratio > b.ratio;
  if (a.hasContent !== b.hasContent) return a.hasContent > b.hasContent;
  return a.nameLength < b.nameLength;
}

export function findByTitle(title) {
  const titleTokens = new Set(tokenize(title));
  if (!titleTokens.size) return null;

  let best = null;
  for (const channel of channels) {
    if (channel.status !== 'active') continue; // unstreamable rules never auto-selected
    const tokens = significantTokens(channel.channelName);
    if (!tokens.length) continue;
    const matched = tokens.filter((t) => titleTokens.has(t));
    if (!matched.length) continue;
    const ratio = matched.length / tokens.length;
    if (ratio < MIN_TITLE_MATCH_RATIO) continue;

    const candidate = {
      channel,
      matchedCount: matched.length,
      ratio,
      hasContent: channel.tickerUrl || channel.tickerText ? 1 : 0,
      nameLength: String(channel.channelName).trim().length,
      matchedTokens: matched,
    };

    if (!best || isBetterTitleMatch(candidate, best)) best = candidate;
  }

  if (!best) return null;

  return {
    channel: best.channel,
    matchedTokens: best.matchedTokens,
    score: best.matchedCount,
    ratio: Number(best.ratio.toFixed(3)),
  };
}

// ───────────────────────── projection ─────────────────────────
export function toOverlay(channel) {
  return {
    channelName: channel.channelName,
    tickerUrl: resolveMediaUrl(channel.tickerUrl),
    tickerText: channel.tickerText || '',
    tickerOrientation: channel.tickerOrientation || 'horizontal',
    tickerPosition: channel.tickerPosition || 'bottom',
    promoUrl: resolveMediaUrl(channel.promoUrl),
  };
}

export const DEFAULT_OVERLAY = {
  channelName: 'Adda247',
  tickerUrl: '',
  tickerText: 'Adda247 Live Stream',
  tickerOrientation: 'horizontal',
  tickerPosition: 'bottom',
  promoUrl: '',
};

export function resolveRule({ streamKey, channelName, title }) {
  const byKey = findByStreamKey(streamKey);
  if (byKey) return { matchedBy: 'streamKey', channel: byKey, overlay: toOverlay(byKey) };

  const byTitle = findByTitle(title);
  if (byTitle) {
    return {
      matchedBy: 'title',
      channel: byTitle.channel,
      overlay: toOverlay(byTitle.channel),
      titleMatch: { tokens: byTitle.matchedTokens, score: byTitle.score, ratio: byTitle.ratio },
    };
  }

  const byName = findByChannelName(channelName);
  if (byName) return { matchedBy: 'channelName', channel: byName, overlay: toOverlay(byName) };

  const overlay = Object.assign({}, DEFAULT_OVERLAY);
  if (String(channelName || '').trim()) overlay.channelName = String(channelName).trim();
  return { matchedBy: 'fallback', channel: null, overlay };
}

// ───────────────────────── http helpers ─────────────────────────
export function applyCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type,x-auth-token,accept');
  res.setHeader('Cache-Control', 'no-store');
}

export function readJsonBody(req) {
  const body = req.body;
  if (!body) return {};
  if (typeof body === 'object') return body;
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return {};
}
