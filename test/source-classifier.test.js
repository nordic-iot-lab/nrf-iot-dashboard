const test = require("node:test");
const assert = require("node:assert/strict");

const { detectMqttLogicalSource } = require("../server/sourceClassifier");

test("default mqtt source when no coap marker", () => {
  const source = detectMqttLogicalSource({ temperature: 20 }, {});
  assert.equal(source, "mqtt");
});

test("payload source=coap should map to coap-mqtt", () => {
  const source = detectMqttLogicalSource({ source: "coap" }, {});
  assert.equal(source, "coap-mqtt");
});

test("payload protocol coap should map to coap-mqtt", () => {
  const source = detectMqttLogicalSource({ protocol: "coap->mqtt" }, {});
  assert.equal(source, "coap-mqtt");
});

test("mqtt5 user property marker should map to coap-mqtt", () => {
  const source = detectMqttLogicalSource(
    { temperature: 22 },
    { properties: { userProperties: { source: "coap_bridge" } } }
  );
  assert.equal(source, "coap-mqtt");
});

