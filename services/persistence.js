const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const { createClient } = require('redis');

const DB_PATH = process.env.TOTP_DB_PATH || path.join(__dirname, '..', 'totp.db');
const REDIS_URL = process.env.TOTP_REDIS_URL || process.env.REDIS_URL || '';
const REDIS_TTL_SECONDS = 24 * 60 * 60;

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const dbPromise = (async () => {
  const SQL = await initSqlJs({
    locateFile: (file) => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', file)
  });
  const db = fs.existsSync(DB_PATH)
    ? new SQL.Database(fs.readFileSync(DB_PATH))
    : new SQL.Database();

  db.run(`
    CREATE TABLE IF NOT EXISTS totp_accounts (
      issuer TEXT NOT NULL,
      account TEXT NOT NULL,
      secret TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (issuer, account)
    )
  `);

  return { SQL, db };
})();

const persistDb = async () => {
  const { db } = await dbPromise;
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
};

let redisClient = null;
let redisReady = false;

if (REDIS_URL) {
  redisClient = createClient({ url: REDIS_URL });
  redisClient.on('error', (err) => {
    console.warn('[redis] 连接失败，降级为仅sqlite:', err.message);
  });
  redisClient.connect().then(() => {
    redisReady = true;
  }).catch(() => {
    redisReady = false;
  });
}

const redisKey = (issuer, account) => `totp:secret:${issuer}:${account}`;

async function saveSecret(issuer, account, secret) {
  const { db, SQL } = await dbPromise;
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO totp_accounts (issuer, account, secret, created_at)
     VALUES (:issuer, :account, :secret, datetime('now'))`
  );
  stmt.bind({ ':issuer': issuer, ':account': account, ':secret': secret });
  stmt.step();
  stmt.free();
  await persistDb();

  if (redisReady && redisClient) {
    try {
      await redisClient.set(redisKey(issuer, account), secret, { EX: REDIS_TTL_SECONDS });
    } catch (err) {
      console.warn('[redis] set 失败:', err.message);
    }
  }
}

async function getSecret(issuer, account) {
  if (!issuer || !account) return null;

  if (redisReady && redisClient) {
    try {
      const cached = await redisClient.get(redisKey(issuer, account));
      if (cached) return cached;
    } catch (err) {
      console.warn('[redis] get 失败:', err.message);
    }
  }

  const { db } = await dbPromise;
  const stmt = db.prepare(`SELECT secret FROM totp_accounts WHERE issuer = :issuer AND account = :account LIMIT 1`);
  stmt.bind({ ':issuer': issuer, ':account': account });
  const hasRow = stmt.step();
  const secret = hasRow ? stmt.getAsObject().secret : null;
  stmt.free();

  if (secret && redisReady && redisClient) {
    try {
      await redisClient.set(redisKey(issuer, account), secret, { EX: REDIS_TTL_SECONDS });
    } catch (err) {
      console.warn('[redis] set 失败:', err.message);
    }
  }

  return secret || null;
}

module.exports = { saveSecret, getSecret };
