const test = require("node:test");
const assert = require("node:assert/strict");

const { upsertNodeTelemetry, getAllNodes, resetStore } = require("../server/nodeStore");

test("upstream object map format should map key as fallback node id", () => {
  resetStore();
  upsertNodeTelemetry({ temperature: 30.1, humidity: 55 }, "a1b2");
  upsertNodeTelemetry({ mac: "cc:dd:ee:ff:c3:d4", temperature: 22.7, humidity: 60 }, "3:d4");

  const items = getAllNodes();
  const ids = items.map((x) => x.nodeId).sort();

  assert.deepEqual(ids, ["a1b2", "c3d4"]);
});

test("istag-like payload fields should normalize correctly", () => {
  resetStore();
  const row = upsertNodeTelemetry(
    {
      device: "ISTAG-0001",
      ts_ms: 3244228,
      state: "running",
      events: 0,
      urgent: false,
      temp_c: 32,
      vibration_mg: 320,
      tilt_deg: 2,
      battery_pct: 87
    },
    "0001"
  );

  assert.equal(row.nodeId, "0001");
  assert.equal(row.temperature, 32);
  assert.equal(row.battery, 87);
  assert.equal(row.status, "running");
  assert.equal(row.events, 0);
  assert.equal(row.urgent, false);
  assert.equal(row.vibrationMg, 320);
  assert.equal(row.tiltDeg, 2);
});

test("unchanged payload should not bump updatedAt but should bump lastSeenAt", async () => {
  resetStore();
  const first = upsertNodeTelemetry({ mac_last4: "a1b2", temperature: 30.1 }, "a1b2");
  await new Promise((r) => setTimeout(r, 4));
  const second = upsertNodeTelemetry({ mac_last4: "a1b2", temperature: 30.1 }, "a1b2");

  assert.equal(second.updatedAt, first.updatedAt);
  assert.ok(second.lastSeenAt >= first.lastSeenAt);
});
