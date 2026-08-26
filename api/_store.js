'use strict';
/**
 * Shared in-memory session store.
 */

if (!globalThis.__obsSessions) {
  globalThis.__obsSessions = new Map();
}

const sessions = globalThis.__obsSessions;

function sessionSet(token, data) {
  sessions.set(token, data);
  setTimeout(() => sessions.delete(token), 5 * 60 * 1000);
}

function sessionGet(token) {
  return sessions.get(token) ?? null;
}

function sessionDelete(token) {
  sessions.delete(token);
}

module.exports = {
  sessions,
  sessionSet,
  sessionGet,
  sessionDelete,
};
