const { Pool } = require("pg");

let pool = null;

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

function buildNodeRecord(row, nodeId) {
  const payload = maybeParsePayload(row.payload);
  const timestamp = row.timestamp ? new Date(row.timestamp).getTime() : Date.now();

  const temp =
    payload.temperature ??
    payload.temp ??
    payload.temp_c ??
    payload.tempC ??
    null;

  const hum = payload.humidity ?? payload.humi ?? payload.hum ?? null;
  const battery = payload.battery ?? payload.battery_mv ?? payload.battery_pct ?? null;

  return {
    nodeId,
    timestamp,
    temperature: temp,
    humidity: hum,
    battery,
    raw: payload
  };
}

function topicForNodeId(nodeId) {
  return `sensor/${String(nodeId).toLowerCase()}/data`;
}

function createHistoryStore(config) {
  const enabled =
    config.PG_ENABLED &&
    config.PG_HOST &&
    config.PG_DATABASE &&
    config.PG_USER &&
    config.PG_PASSWORD;

  if (!enabled) {
    console.log("[pg] history store disabled");
    return {
      isEnabled: () => false,
      getHistory: async () => []
    };
  }

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

  console.log(`[pg] history store enabled -> ${config.PG_HOST}:${config.PG_PORT}/${config.PG_DATABASE}`);

  return {
    isEnabled: () => true,
    getHistory: async (nodeId, limit) => {
      const safeLimit = Math.max(1, Math.min(500, Number(limit || 100)));
      const topic = topicForNodeId(nodeId);
      const sql = `
        SELECT topic, payload, "timestamp"
        FROM mqtt_messages
        WHERE topic = $1
        ORDER BY "timestamp" DESC
        LIMIT $2
      `;

      const result = await pool.query({
        text: sql,
        values: [topic, safeLimit],
        statement_timeout: Number(config.PG_QUERY_TIMEOUT_MS || 4000)
      });
      return result.rows.map((row) => buildNodeRecord(row, nodeId));
    }
  };
}

module.exports = {
  createHistoryStore,
  topicForNodeId,
  buildNodeRecord
};
