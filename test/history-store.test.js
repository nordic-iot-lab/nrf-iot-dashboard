const test = require("node:test");
const assert = require("node:assert/strict");

const { topicForNodeId, buildNodeRecord } = require("../server/historyStore");

test("topicForNodeId should map node id to sensor topic", () => {
  assert.equal(topicForNodeId("A1B2"), "sensor/a1b2/data");
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

