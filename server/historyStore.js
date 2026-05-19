const { getPool, isPostgresEnabled } = require("./db");

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
    source: row.source || null,
    raw: payload
  };
}

function topicForNodeId(nodeId) {
  return `sensor/${String(nodeId).toLowerCase()}/data`;
}

function topicForNodeIdByTemplate(nodeId, topicTemplate) {
  const id = String(nodeId || "")
    .trim()
    .toLowerCase();
  const template = String(topicTemplate || "").trim();
  if (!template) return topicForNodeId(id);
  if (template.includes("{nodeId}")) {
    return template.split("{nodeId}").join(id);
  }
  if (template.includes("+")) {
    return template.replace("+", id);
  }
  return template;
}

function hasTopicPlaceholder(topicTemplate) {
  const template = String(topicTemplate || "").trim();
  if (!template) return false;
  return template.includes("+") || template.includes("{nodeId}");
}

function normalizeLimit(limit, fallback = 100) {
  const n = Number.parseInt(String(limit || ""), 10);
  const valid = Number.isFinite(n) ? n : fallback;
  return Math.max(1, Math.min(500, valid));
}

function createHistoryStore(config) {
  if (!isPostgresEnabled(config)) {
    console.log("[pg] history store disabled");
    return {
      isEnabled: () => false,
      getHistory: async () => []
    };
  }

  const pool = getPool(config);

  const topicTemplate = config.HISTORY_TOPIC_TEMPLATE || config.MQTT_TOPIC || "sensor/+/data";
  console.log(`[pg] history store enabled -> ${config.PG_HOST}:${config.PG_PORT}/${config.PG_DATABASE}`);
  console.log(`[pg] history topic template -> ${topicTemplate}`);
  if (!hasTopicPlaceholder(topicTemplate)) {
    console.warn(
      `[pg] history topic template "${topicTemplate}" has no placeholder (+/{nodeId}); all nodes will query the same topic`
    );
  }

  return {
    isEnabled: () => true,
    getHistory: async (nodeId, limit) => {
      const safeLimit = normalizeLimit(limit, 100);
      const normalizedNodeId = String(nodeId || "")
        .trim()
        .toLowerCase();
      const topic = topicForNodeIdByTemplate(normalizedNodeId, topicTemplate);
      const statements = [
        {
          text: `
            SELECT topic, payload, source, received_at AS timestamp
            FROM telemetry_messages
            WHERE node_id = $1
            ORDER BY received_at DESC
            LIMIT $2
          `,
          values: [normalizedNodeId, safeLimit]
        },
        {
          text: `
            SELECT topic, payload, NULL::text AS source, "timestamp"
            FROM mqtt_messages
            WHERE topic = $1
            ORDER BY "timestamp" DESC
            LIMIT $2
          `,
          values: [topic, safeLimit]
        }
      ];

      for (const statement of statements) {
        try {
          const result = await pool.query({
            text: statement.text,
            values: statement.values,
            statement_timeout: Number(config.PG_QUERY_TIMEOUT_MS || 4000)
          });
          return result.rows.map((row) => buildNodeRecord(row, normalizedNodeId));
        } catch (err) {
          if (!String(err.message || "").includes("does not exist")) {
            throw err;
          }
        }
      }

      return [];
    }
  };
}

module.exports = {
  createHistoryStore,
  topicForNodeId,
  topicForNodeIdByTemplate,
  hasTopicPlaceholder,
  normalizeLimit,
  buildNodeRecord
};
