'use strict';
/**
 * GET /api/health — simple health check
 */
module.exports = (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'obs-relay',
    timestamp: new Date().toISOString(),
    kv: !!process.env.KV_REST_API_URL,
  });
};
