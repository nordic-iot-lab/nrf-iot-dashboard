const test = require("node:test");
const assert = require("node:assert/strict");

const {
  topicForNodeId,
  topicForNodeIdByTemplate,
  hasTopicPlaceholder,
  normalizeLimit,
  buildNodeRecord,
  createHistoryStore
} = require("../server/historyStore");

test("topicForNodeId should map node id to sensor topic", () => {
  assert.equal(topicForNodeId("A1B2"), "sensor/a1b2/data");
});

test("topicForNodeIdByTemplate should map + wildcard topic", () => {
  assert.equal(topicForNodeIdByTemplate("A1B2", "nrf/+/telemetry"), "nrf/a1b2/telemetry");
});

test("topicForNodeIdByTemplate should map {nodeId} topic", () => {
  assert.equal(topicForNodeIdByTemplate("A1B2", "sensor/{nodeId}/data"), "sensor/a1b2/data");
});

test("normalizeLimit should clamp and fallback on invalid values", () => {
  assert.equal(normalizeLimit(undefined, 100), 100);
  assert.equal(normalizeLimit("abc", 100), 100);
  assert.equal(normalizeLimit("9999", 100), 500);
  assert.equal(normalizeLimit("-5", 100), 1);
});

test("hasTopicPlaceholder should validate template placeholders", () => {
  assert.equal(hasTopicPlaceholder(""), false);
  assert.equal(hasTopicPlaceholder("sensor/fixed/data"), false);
  assert.equal(hasTopicPlaceholder("sensor/+/data"), true);
  assert.equal(hasTopicPlaceholder("sensor/{nodeId}/data"), true);
});

test("buildNodeRecord should normalize history payload", () => {
  const row = {
    topic: "sensor/a1b2/data",
    payload: JSON.stringify({
      temp_c: 31.2,
      humidity: 51,
      battery_pct: 90
    }),
    timestamp: "2026-05-16T10:00:00.000Z"
  };

  const mapped = buildNodeRecord(row, "a1b2");
  assert.equal(mapped.nodeId, "a1b2");
  assert.equal(mapped.temperature, 31.2);
  assert.equal(mapped.humidity, 51);
  assert.equal(mapped.battery, 90);
  assert.ok(mapped.timestamp > 0);
});

test("history store should query telemetry_messages before legacy mqtt_messages", async () => {
  const queries = [];
  const originalQuery = require("pg").Pool.prototype.query;

  require("pg").Pool.prototype.query = async function patchedQuery(input) {
    queries.push(input.text);
    if (input.text.includes("telemetry_messages")) {
      return {
        rows: [
          {
            topic: "sensor/a1b2/data",
            source: "mqtt",
            payload: JSON.stringify({ temperature: 28.5, humidity: 50, battery: 88 }),
            timestamp: "2026-05-17T10:00:00.000Z"
          }
        ]
      };
    }
    throw new Error("legacy query should not run");
  };

  try {
    const store = createHistoryStore({
      PG_ENABLED: true,
      PG_HOST: "127.0.0.1",
      PG_PORT: 5432,
      PG_DATABASE: "nordic",
      PG_USER: "nordic",
      PG_PASSWORD: "pw",
      PG_SSL: false,
      PG_CONNECT_TIMEOUT_MS: 1000,
      PG_QUERY_TIMEOUT_MS: 1000,
      MQTT_TOPIC: "sensor/+/data"
    });

    const items = await store.getHistory("A1B2", 10);
    assert.equal(items.length, 1);
    assert.equal(String(items[0].nodeId).toLowerCase(), "a1b2");
    assert.equal(items[0].temperature, 28.5);
    assert.equal(items[0].source, "mqtt");
    assert.equal(queries.some((text) => text.includes("telemetry_messages")), true);
  } finally {
    require("pg").Pool.prototype.query = originalQuery;
  }
});

test("history store should use node_id lookup so coap records are queryable", async () => {
  const originalQuery = require("pg").Pool.prototype.query;
  const calls = [];

  require("pg").Pool.prototype.query = async function patchedQuery(input) {
    calls.push(input);
    if (input.text.includes("telemetry_messages")) {
      return {
        rows: [
          {
            topic: "coap:/telemetry/coap01",
            source: "coap",
            payload: JSON.stringify({ temperature: 29.8, humidity: 44, battery: 83 }),
            timestamp: "2026-05-17T10:05:00.000Z"
          }
        ]
      };
    }
    return { rows: [] };
  };

  try {
    const store = createHistoryStore({
      PG_ENABLED: true,
      PG_HOST: "127.0.0.1",
      PG_PORT: 5432,
      PG_DATABASE: "nordic",
      PG_USER: "nordic",
      PG_PASSWORD: "pw",
      PG_SSL: false,
      PG_CONNECT_TIMEOUT_MS: 1000,
      PG_QUERY_TIMEOUT_MS: 1000,
      MQTT_TOPIC: "sensor/+/data"
    });

    const items = await store.getHistory("CoAp01", 10);
    assert.equal(items.length, 1);
    assert.equal(items[0].nodeId, "coap01");
    assert.equal(items[0].source, "coap");
    assert.equal(calls[0].values[0], "coap01");
  } finally {
    require("pg").Pool.prototype.query = originalQuery;
  }
});
