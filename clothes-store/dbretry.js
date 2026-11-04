'use strict';
// Makes a mysql2 pool survive stale connections (serverless platforms freeze the process,
// and TiDB / MySQL close idle connections, so a pooled connection can be dead when reused).
const RETRY_CODES = new Set(['PROTOCOL_CONNECTION_LOST', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ECONNABORTED']);

function isRetryable(e) {
  if (!e) return false;
  if (RETRY_CODES.has(e.code)) return true;
  return /closed state|connection lost|server has gone away|read ECONNRESET|write EPIPE/i.test(String(e.message || ''));
}

function resilient(pool) {
  return {
    async query(...args) {
      try {
        return await pool.query(...args);
      } catch (e) {
        if (!isRetryable(e)) throw e;
        return pool.query(...args); // the dead connection was dropped, retry on a fresh one
      }
    },
    async getConnection() {
      let lastErr;
      for (let i = 0; i < 3; i++) {
        let conn;
        try {
          conn = await pool.getConnection();
          await conn.ping();
          return conn;
        } catch (e) {
          lastErr = e;
          if (conn) {
            try {
              conn.destroy();
            } catch (x) {
              /* ignore */
            }
          }
          if (!isRetryable(e)) throw e;
        }
      }
      throw lastErr;
    },
    end: () => pool.end()
  };
}

module.exports = { resilient, isRetryable };
