const test = require("node:test");
const assert = require("node:assert/strict");

const {
  upsertNodeTelemetry,
  getAllNodes,
  getNode,
  getNodeHistory,
  buildSensorSnapshotMap,
  pruneSnapshotNodes,
  resetStore
} = require("../server/nodeStore");
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

test("explicit zero gps should clear stale coordinates", () => {
  resetStore();
  upsertNodeTelemetry(
    { mac_last4: "9512", lat: 31.2304, lng: 121.4737 },
    "9512",
    { source: "mqtt" }
  );

  const row = upsertNodeTelemetry({ mac_last4: "9512", lat: 0, lng: 0 }, "9512", {
    source: "mqtt"
  });

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

test("firmware mode-specific node ids should render as separate cards", () => {
  resetStore();
  upsertNodeTelemetry({ nodeId: "9512-mqtt-tls", temperature: 29, encrypted: true }, "9512-mqtt-tls", {
    source: "mqtt"
  });
  upsertNodeTelemetry({ nodeId: "9512-mqtt-plain", temperature: 29, encrypted: false }, "9512-mqtt-plain", {
    source: "mqtt"
  });
  upsertNodeTelemetry({ nodeId: "9512-coap-dtls", temperature: 29, encrypted: true }, "9512-coap-dtls", {
    source: "coap"
  });
  upsertNodeTelemetry({ nodeId: "9512-coap-plain", temperature: 29, encrypted: false }, "9512-coap-plain", {
    source: "coap"
  });

  const ids = getAllNodes()
    .map((item) => item.nodeId)
    .sort();

  assert.deepEqual(ids, ["9512-coap-dtls", "9512-coap-plain", "9512-mqtt-plain", "9512-mqtt-tls"]);
});

test("sensor topic parser should preserve mode-specific node ids", () => {
  const { parseNodeIdFromTopic } = require("../server/topicParser");
  assert.equal(parseNodeIdFromTopic("sensor/9512-mqtt-tls/data"), "9512-mqtt-tls");
  assert.equal(parseNodeIdFromTopic("sensor/9512-coap-dtls/data"), "9512-coap-dtls");
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

test("pruneSnapshotNodes should remove stale rest-only nodes", () => {
  resetStore();
  upsertNodeTelemetry({ temperature: 1 }, "test", { source: "rest", isSnapshot: true });
  upsertNodeTelemetry({ temperature: 2 }, "dev01", { source: "rest", isSnapshot: true });
  upsertNodeTelemetry({ temperature: 3 }, "9512", { source: "rest", isSnapshot: true });

  pruneSnapshotNodes(new Set(["9512"]), "rest");

  const ids = getAllNodes().map((x) => x.nodeId).sort();
  assert.deepEqual(ids, ["9512"]);
});

test("pruneSnapshotNodes should keep nodes that also have mqtt source", () => {
  resetStore();
  upsertNodeTelemetry({ temperature: 1 }, "9512", { source: "mqtt" });
  upsertNodeTelemetry({ temperature: 1 }, "9512", { source: "rest", isSnapshot: true });
  upsertNodeTelemetry({ temperature: 1 }, "test", { source: "rest", isSnapshot: true });

  pruneSnapshotNodes(new Set(), "rest");

  const ids = getAllNodes().map((x) => x.nodeId).sort();
  assert.deepEqual(ids, ["9512"]);
});

test("sensor snapshot map should expose latest node data keyed by node id", () => {
  resetStore();
  upsertNodeTelemetry(
    {
      mac_last4: "9512",
      temp_c: 32,
      humidity: 55,
      battery_pct: 87,
      lat: 31.23,
      lng: 121.47
    },
    "9512",
    { source: "mqtt" }
  );

  const snapshot = buildSensorSnapshotMap();
  assert.deepEqual(snapshot["9512"], {
    nodeId: "9512",
    temperature: 32,
    humidity: 55,
    battery: 87,
    rssi: null,
    voltage: null,
    co2: null,
    pm25: null,
    status: null,
    events: null,
    urgent: null,
    vibration_mg: null,
    tilt_deg: null,
    lat: 31.23,
    lng: 121.47,
    source: "mqtt",
    updatedAt: snapshot["9512"].updatedAt,
    lastSeenAt: snapshot["9512"].lastSeenAt,
    lastDeviceSeenAt: snapshot["9512"].lastDeviceSeenAt
  });
});
