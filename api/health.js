/**
 * GET /api/health — simple health check
 * Useful to verify the deployment is live before configuring the OBS plugin.
 */
export default function handler(req, res) {
  res.status(200).json({
    status: 'ok',
    service: 'obs-relay',
    timestamp: new Date().toISOString(),
  });
}
