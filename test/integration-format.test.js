const test = require("node:test");
const assert = require("node:assert/strict");

const { upsertNodeTelemetry, getAllNodes, getNode, getNodeHistory, resetStore } = require("../server/nodeStore");
const { pullOnce } = require("../server/upstreamPuller");

test("upstream object map format should map key as fallback node id", () => {
  resetStore();
  upsertNodeTelemetry({ temperature: 30.1, humidity: 55 }, "a1b2");
  upsertNodeTelemetry({ mac: "cc:dd:ee:ff:c3:d4", temperature: 22.7, humidity: 60 }, "3:d4");

  const items = getAllNodes();
  const ids = items.map((x) => x.nodeId).sort();

  assert.deepEqual(ids, ["a1b2", "c3d4"]);
});

test("zero coordinates should be treated as missing gps", () => {
  resetStore();
  const row = upsertNodeTelemetry({ mac_last4: "9512", lat: 0, lng: 0 }, "9512", { source: "mqtt" });
  assert.equal(row.lat, null);
  assert.equal(row.lng, null);
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

test("source fields should be tracked per protocol", async () => {
  resetStore();
  const first = upsertNodeTelemetry({ mac_last4: "a1b2", temperature: 10 }, "a1b2", { source: "mqtt" });
  await new Promise((r) => setTimeout(r, 3));
  const second = upsertNodeTelemetry({ mac_last4: "a1b2", temperature: 10 }, "a1b2", { source: "rest", isSnapshot: true });

  assert.equal(second.lastSource, "mqtt");
  assert.equal(second.lastSnapshotSource, "rest");
  assert.ok(second.sourceLastSeenAt.mqtt > 0);
  assert.ok(second.sourceLastSeenAt.rest > 0);
  assert.ok(second.sourceUpdatedAt.mqtt > 0);
  assert.ok(second.sourceUpdatedAt.rest > 0);
  assert.equal(second.updatedAt, first.updatedAt);
});

test("rest snapshot should not bump device seen time", async () => {
  resetStore();
  const first = upsertNodeTelemetry({ mac_last4: "a1b2", temperature: 10 }, "a1b2", { source: "mqtt" });
  const firstDeviceSeenAt = first.lastDeviceSeenAt;
  await new Promise((r) => setTimeout(r, 3));
  const second = upsertNodeTelemetry({ mac_last4: "a1b2", temperature: 10 }, "a1b2", { source: "rest", isSnapshot: true });

  assert.equal(second.lastDeviceSeenAt, firstDeviceSeenAt);
  assert.ok(second.lastSeenAt >= first.lastSeenAt);
});

test("mqtt and coap sources should bump device seen time", async () => {
  resetStore();
  const first = upsertNodeTelemetry({ mac_last4: "a1b2", temperature: 10 }, "a1b2", { source: "mqtt" });
  await new Promise((r) => setTimeout(r, 3));
  const second = upsertNodeTelemetry({ mac_last4: "a1b2", temperature: 10 }, "a1b2", { source: "coap-mqtt" });

  assert.ok(second.lastDeviceSeenAt >= first.lastDeviceSeenAt);
});

test("in-memory node history should keep recent samples", async () => {
  resetStore();
  upsertNodeTelemetry({ mac_last4: "9512", temperature: 29 }, "9512", { source: "mqtt" });
  await new Promise((r) => setTimeout(r, 3));
  upsertNodeTelemetry({ mac_last4: "9512", temperature: 30 }, "9512", { source: "mqtt" });
  await new Promise((r) => setTimeout(r, 3));
  upsertNodeTelemetry({ mac_last4: "9512", temperature: 31 }, "9512", { source: "rest", isSnapshot: true });

  const history = getNodeHistory("9512", 2);
  assert.equal(history.length, 2);
  assert.equal(history[0].temperature, 31);
  assert.equal(history[1].temperature, 30);
});

test("upstream payload source should override rest default", async () => {
  resetStore();
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      "0001": {
        source: "coap",
        temp_c: 32
      }
    })
  });

  try {
    const result = await pullOnce({ UPSTREAM_PULL_URL: "http://fake.local/sensor" });
    assert.equal(result.ok, true);
    const row = getAllNodes().find((x) => x.nodeId === "0001");
    assert.equal(row.lastSnapshotSource, "coap");
    assert.equal(row.lastSource, "unknown");
  } finally {
    global.fetch = originalFetch;
  }
});

test("upstream topic-like coap marker should map to coap-mqtt", async () => {
  resetStore();
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      "9512": {
        topic: "coap/9512",
        temperature: 30
      }
    })
  });

  try {
    const result = await pullOnce({ UPSTREAM_PULL_URL: "http://fake.local/sensor" });
    assert.equal(result.ok, true);
    const row = getAllNodes().find((x) => x.nodeId === "9512");
    assert.equal(row.lastSnapshotSource, "coap-mqtt");
    assert.equal(row.lastSource, "unknown");
  } finally {
    global.fetch = originalFetch;
  }
});

test("getNode should normalize nodeId lookup", () => {
  resetStore();
  upsertNodeTelemetry({ mac_last4: "a1b2", temperature: 30 }, "a1b2", { source: "mqtt" });

  const upper = getNode("A1B2");
  const mixed = getNode(" a1B2 ");
  assert.equal(upper.nodeId, "a1b2");
  assert.equal(mixed.nodeId, "a1b2");
});
