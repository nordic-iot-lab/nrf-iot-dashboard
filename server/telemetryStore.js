const { Pool } = require("pg");

let pool = null;
let schemaReady = false;
let initPromise = null;

function maybeParsePayload(raw) {
  if (raw === null || raw === undefined) return {};
  if (typeof raw === "object") return raw;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return {};
}

function isEnabled(config) {
  return Boolean(
    config.PG_ENABLED &&
      config.PG_HOST &&
      config.PG_DATABASE &&
      config.PG_USER &&
      config.PG_PASSWORD
  );
}

function getPool(config) {
  if (!isEnabled(config)) {
    return null;
  }

  if (!pool) {
    pool = new Pool({
      host: config.PG_HOST,
      port: Number(config.PG_PORT || 5432),
      database: config.PG_DATABASE,
      user: config.PG_USER,
      password: config.PG_PASSWORD,
      ssl: config.PG_SSL ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: Number(config.PG_CONNECT_TIMEOUT_MS || 3000),
      query_timeout: Number(config.PG_QUERY_TIMEOUT_MS || 4000)
    });
  }

  return pool;
}

async function ensureSchema(config) {
  if (!isEnabled(config)) {
    return false;
  }

  if (schemaReady) {
    return true;
  }

  if (!initPromise) {
    initPromise = (async () => {
      const db = getPool(config);
      await db.query(`
        CREATE TABLE IF NOT EXISTS telemetry_messages (
          id BIGSERIAL PRIMARY KEY,
          node_id TEXT NOT NULL,
          topic TEXT NOT NULL,
          source TEXT NOT NULL,
          payload JSONB NOT NULL,
          received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_telemetry_messages_node_time
        ON telemetry_messages (node_id, received_at DESC)
      `);
      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_telemetry_messages_topic_time
        ON telemetry_messages (topic, received_at DESC)
      `);
      schemaReady = true;
      console.log("[pg] telemetry store ready");
      return true;
    })().catch((err) => {
      initPromise = null;
      throw err;
    });
  }

  return initPromise;
}

async function storeTelemetryMessage(config, message) {
  if (!isEnabled(config)) {
    return false;
  }

  await ensureSchema(config);
  const db = getPool(config);
  await db.query(
    `
      INSERT INTO telemetry_messages (node_id, topic, source, payload, received_at)
      VALUES ($1, $2, $3, $4::jsonb, NOW())
    `,
    [
      String(message.nodeId || "unknown").toLowerCase(),
      String(message.topic || ""),
      String(message.source || "unknown").toLowerCase(),
      JSON.stringify(message.payload || {})
    ]
  );
  return true;
}

async function loadLatestTelemetry(config, limit = 1000) {
  if (!isEnabled(config)) {
    return [];
  }

  await ensureSchema(config);
  const db = getPool(config);
  const safeLimit = Math.max(1, Math.min(5000, Number(limit || 1000)));
  const result = await db.query(
    `
      SELECT *
      FROM (
        SELECT DISTINCT ON (node_id)
          node_id,
          topic,
          source,
          payload,
          received_at
        FROM telemetry_messages
        ORDER BY node_id, received_at DESC
      ) latest
      ORDER BY received_at DESC
      LIMIT $1
    `,
    [safeLimit]
  );

  return result.rows.map((row) => ({
    nodeId: String(row.node_id || "unknown").toLowerCase(),
    topic: String(row.topic || ""),
    source: String(row.source || "unknown").toLowerCase(),
    payload: maybeParsePayload(row.payload),
    receivedAt:
      row.received_at instanceof Date
        ? row.received_at.toISOString()
        : String(row.received_at || "")
  }));
}

module.exports = {
  ensureSchema,
  storeTelemetryMessage,
  loadLatestTelemetry
};
