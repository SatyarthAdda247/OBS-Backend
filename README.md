# OBS Relay — Vercel Deployment

Bridges the OBS QR Stream Key plugin with the mobile app over **any network** — no same-WiFi requirement.

## How it works

```
OBS Plugin  ──POST /api/session──→  Vercel Relay  ←──POST /api/pair──  Mobile App
            ←──GET  /api/session──  (any network)
```

1. OBS starts → plugin POSTs to `/api/session` → gets back a `pairUrl`
2. QR code encodes that `pairUrl` (e.g. `https://your-relay.vercel.app/api/pair?token=uuid`)
3. Teacher scans QR with mobile app → app POSTs stream key to `pairUrl`
4. OBS polls `/api/session?token=uuid` every 2s → gets stream key → applies it

---

## Deploy in 5 minutes

### Prerequisites
- [Node.js](https://nodejs.org) installed
- [Vercel account](https://vercel.com) (free)

### Steps

```bash
# 1. Install Vercel CLI
npm install -g vercel

# 2. Install dependencies
cd obs-relay
npm install

# 3. Deploy
vercel

# Follow the prompts:
#   - Link to existing project? No
#   - Project name: obs-relay (or anything you like)
#   - Directory: ./  (current directory)
#   - Override settings? No

# 4. Deploy to production
vercel --prod
```

You'll get a URL like: `https://obs-relay-abc123.vercel.app`

### Add Vercel KV (for production persistence)

Without KV, sessions use in-memory storage which resets on cold starts.
For reliable production use, add Vercel KV (free tier: 30k requests/month):

```bash
# In the Vercel dashboard:
# 1. Go to your project → Storage tab
# 2. Create a KV database
# 3. Connect it to your project
# Vercel automatically adds KV_REST_API_URL and KV_REST_API_TOKEN env vars
```

---

## Update the OBS plugin

After deploying, update `kRelayHost` in the OBS plugin to your Vercel domain:

In `obs-studio/frontend/plugins/obs-qr-stream-key/qr-relay-client.cpp`:
```cpp
static constexpr const char *kRelayHost = "your-relay-abc123.vercel.app";
```

Then rebuild and reinstall the plugin.

---

## API Reference

### POST /api/session
OBS registers a new pairing session.

**Request:**
```json
{ "token": "uuid", "facultyId": "150" }
```

**Response 200:**
```json
{
  "success": true,
  "data": { "pairUrl": "https://your-relay.vercel.app/api/pair?token=uuid" }
}
```

---

### GET /api/session?token=\<uuid\>
OBS polls for pairing result (every 2 seconds).

**Response — pending:**
```json
{ "success": true, "data": null }
```

**Response — paired:**
```json
{
  "success": true,
  "data": {
    "streamKey": "live_xxxxxxxxxxxxxxxx",
    "classId": "988036",
    "sceneCollection": "Lecture"
  }
}
```

**Response — expired/invalid:**
```json
{ "success": false }
```

---

### POST /api/pair?token=\<uuid\>
Mobile app sends stream key after scanning QR.

**Request:**
```json
{
  "streamKey": "live_xxxxxxxxxxxxxxxx",
  "classId": "988036",
  "sceneCollection": "Lecture"
}
```

**Response 200:**
```json
{ "status": "ok" }
```

**Response 403:**
```json
{ "status": "error", "message": "invalid or expired token" }
```

---

### DELETE /api/session?token=\<uuid\>
OBS invalidates session on dialog dismiss or timeout.

**Response 200:**
```json
{ "success": true }
```

---

### GET /api/health
Health check.

**Response 200:**
```json
{ "status": "ok", "service": "obs-relay", "timestamp": "2026-04-29T..." }
```

---

## Session lifecycle

```
OBS starts
  → POST /api/session  (token created, TTL 5 min)
  → QR shown with pairUrl

Teacher scans QR
  → POST /api/pair  (stream key stored)

OBS polls every 2s
  → GET /api/session?token=...
  → Gets stream key → applies to OBS → dialog closes
  → DELETE /api/session (cleanup)

If not paired within 5 min:
  → Token auto-expires (KV TTL)
  → OBS timeout fires → DELETE /api/session
```

---

## Local development

```bash
# Install Vercel CLI
npm install -g vercel

# Run locally
vercel dev
# Server runs at http://localhost:3000

# Test health check
curl http://localhost:3000/api/health

# Test session registration
curl -X POST http://localhost:3000/api/session \
  -H "Content-Type: application/json" \
  -d '{"token":"test-uuid-123","facultyId":"150"}'

# Test pairing
curl -X POST "http://localhost:3000/api/pair?token=test-uuid-123" \
  -H "Content-Type: application/json" \
  -d '{"streamKey":"live_test","classId":"988036"}'

# Test polling
curl "http://localhost:3000/api/session?token=test-uuid-123"
```
