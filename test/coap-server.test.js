const test = require("node:test");
const assert = require("node:assert/strict");

const { stripAuthFields } = require("../server/coapServer");

test("stripAuthFields should remove CoAP auth tokens before persistence", () => {
  const cleaned = stripAuthFields({
    nodeId: "a1b2",
    temperature: 26.5,
    token: "secret-token",
    authToken: "other-secret"
  });

  assert.deepEqual(cleaned, {
    nodeId: "a1b2",
    temperature: 26.5
  });
});
