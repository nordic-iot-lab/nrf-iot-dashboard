const test = require("node:test");
const assert = require("node:assert/strict");

const { upsertNodeTelemetry, getNode, resetStore } = require("../server/nodeStore");

test("restored nodes should keep recovered marker until a live device packet arrives", () => {
  resetStore();

  const restored = upsertNodeTelemetry(
    { mac_last4: "a1b2", temperature: 26.4, encrypted: true },
    "a1b2",
    {
      source: "mqtt",
      observedAt: Date.parse("2026-05-17T12:00:00.000Z"),
      restoredFromStorage: true
    }
  );

  assert.equal(restored.restoredFromStorage, true);
  assert.equal(restored.lastSeenAt, Date.parse("2026-05-17T12:00:00.000Z"));

  const afterSnapshot = upsertNodeTelemetry(
    { mac_last4: "a1b2", temperature: 26.4 },
    "a1b2",
    {
      source: "rest",
      isSnapshot: true,
      observedAt: Date.parse("2026-05-17T12:05:00.000Z")
    }
  );

  assert.equal(afterSnapshot.restoredFromStorage, true);

  const afterLivePacket = upsertNodeTelemetry(
    { mac_last4: "a1b2", temperature: 27.1, encrypted: false },
    "a1b2",
    {
      source: "coap",
      observedAt: Date.parse("2026-05-17T12:06:00.000Z")
    }
  );

  assert.equal(afterLivePacket.restoredFromStorage, false);
  assert.equal(getNode("A1B2").restoredFromStorage, false);
});
