import test from "node:test";
import assert from "node:assert/strict";

import { baseNodeId, modeLabel, groupNodesByDevice } from "../web/dashboard-grouping.mjs";

test("baseNodeId should collapse mode suffixes back to device id", () => {
  assert.equal(baseNodeId("9512-mqtt-plain"), "9512");
  assert.equal(baseNodeId("9512-mqtt-tls"), "9512");
  assert.equal(baseNodeId("9512-coap-plain"), "9512");
  assert.equal(baseNodeId("9512-coap-dtls"), "9512");
  assert.equal(baseNodeId("coap01"), "coap01");
});

test("modeLabel should convert node ids into human labels", () => {
  assert.equal(modeLabel("9512-mqtt-plain"), "MQTT PLAIN");
  assert.equal(modeLabel("9512-mqtt-tls"), "MQTT TLS");
  assert.equal(modeLabel("9512-coap-plain"), "COAP PLAIN");
  assert.equal(modeLabel("9512-coap-dtls"), "COAP DTLS");
  assert.equal(modeLabel("coap01"), "DEFAULT");
});

test("groupNodesByDevice should cluster the four transport variants under one device", () => {
  const grouped = groupNodesByDevice([
    { nodeId: "9512-mqtt-plain", updatedAt: 1 },
    { nodeId: "9512-coap-dtls", updatedAt: 4 },
    { nodeId: "9512-mqtt-tls", updatedAt: 3 },
    { nodeId: "9512-coap-plain", updatedAt: 2 },
    { nodeId: "test01", updatedAt: 5 }
  ]);

  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].deviceId, "test01");
  assert.equal(grouped[1].deviceId, "9512");
  assert.deepEqual(
    grouped[1].variants.map((item) => item.nodeId),
    ["9512-coap-dtls", "9512-mqtt-tls", "9512-coap-plain", "9512-mqtt-plain"]
  );
});
