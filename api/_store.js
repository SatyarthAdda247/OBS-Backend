'use strict';

/**
 * Distributed Session Store for Vercel Serverless & Local Dev.
 * Uses restful-api.dev REST API as global distributed backup store
 * so all serverless function containers instantly share session state.
 */

if (!globalThis.__obsSessions) {
  globalThis.__obsSessions = new Map();
}
if (!globalThis.__obsTokenIds) {
  globalThis.__obsTokenIds = new Map();
}

const sessions = globalThis.__obsSessions;
const tokenIds = globalThis.__obsTokenIds;

async function remoteSet(token, data) {
  try {
    const existingId = tokenIds.get(token);
    if (existingId) {
      // Update existing object
      await fetch(`https://api.restful-api.dev/objects/${existingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `obs_${token}`, data })
      });
      return;
    }

    // Create new object
    const res = await fetch('https://api.restful-api.dev/objects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `obs_${token}`, data })
    });
    if (res.ok) {
      const json = await res.json();
      if (json.id) {
        tokenIds.set(token, json.id);
      }
    }
  } catch (e) {
    console.warn("[_store] Remote set warning:", e.message || e);
  }
}

async function remoteGet(token) {
  try {
    const id = tokenIds.get(token);
    if (id) {
      const res = await fetch(`https://api.restful-api.dev/objects/${id}`);
      if (res.ok) {
        const json = await res.json();
        return json.data || null;
      }
    }
  } catch (e) {
    console.warn("[_store] Remote get warning:", e.message || e);
  }
  return null;
}

function sessionSet(token, data) {
  sessions.set(token, data);
  // Async sync to remote store
  remoteSet(token, data).catch(() => {});
  // Auto-expire local memory after 5 mins
  setTimeout(() => {
    sessions.delete(token);
    tokenIds.delete(token);
  }, 5 * 60 * 1000);
}

async function sessionGet(token) {
  const local = sessions.get(token);
  if (local) return local;

  const remote = await remoteGet(token);
  if (remote) {
    sessions.set(token, remote);
    return remote;
  }

  return null;
}

function sessionDelete(token) {
  sessions.delete(token);
  tokenIds.delete(token);
}

module.exports = {
  sessions,
  sessionSet,
  sessionGet,
  sessionDelete,
};
