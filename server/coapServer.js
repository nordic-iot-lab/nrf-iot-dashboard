const coap = require("coap");
const crypto = require("crypto");
const { upsertNodeTelemetry } = require("./nodeStore");
const { storeTelemetryMessage } = require("./telemetryStore");

function getNodeIdFromPath(urlPath) {
  const parts = String(urlPath || "").split("/").filter(Boolean);
  if (parts.length >= 2 && parts[0] === "telemetry") {
    return parts[1];
  }
  return "unknown";
}

function safeTokenEquals(actual, expected) {
  const actualBuffer = Buffer.from(String(actual || ""));
  const expectedBuffer = Buffer.from(String(expected || ""));
  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function stripAuthFields(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {};
  }

  const { token, authToken, ...cleanPayload } = payload;
  return cleanPayload;
}

function startCoapIngest(config) {
  if (!config.COAP_ENABLED) {
    console.log("[coap] disabled");
    return;
  }

  const port = Number(config.COAP_PORT || 5683);
  const host = config.COAP_HOST || "0.0.0.0";
  const server = coap.createServer();
  const expectedToken = String(config.COAP_AUTH_TOKEN || "").trim();
  if (!expectedToken) {
    console.warn("[coap] COAP_AUTH_TOKEN is not set - CoAP ingest is unauthenticated");
  }

  server.on("request", (req, res) => {
    const method = req.method || "";
    if (method !== "POST" && method !== "PUT") {
      res.code = "4.05";
      res.end("method_not_allowed");
      return;
    }

    const pathName = req.url || "/";
    const bodyText = req.payload ? req.payload.toString("utf8") : "";

    let payload;
    try {
      payload = bodyText ? JSON.parse(bodyText) : {};
    } catch {
      res.code = "4.00";
      res.end("invalid_json");
      return;
    }

    if (expectedToken && !safeTokenEquals(String(payload.token || payload.authToken || "").trim(), expectedToken)) {
      res.code = "4.01";
      res.end("unauthorized");
      return;
    }

    const cleanPayload = stripAuthFields(payload);
    const fallbackNodeId = getNodeIdFromPath(pathName);
    const saved = upsertNodeTelemetry(cleanPayload, fallbackNodeId, { source: "coap" });
    storeTelemetryMessage(config, {
      nodeId: saved.nodeId,
      topic: `coap:${pathName}`,
      source: "coap",
      payload: cleanPayload
    }).catch((err) => {
      console.warn(`[pg] coap store failed: ${err.message}`);
    });

    res.code = "2.04";
    res.end("ok");
    console.log(
      `[coap] node=${saved.nodeId} temp=${saved.temperature} hum=${saved.humidity} battery=${saved.battery}`
    );
  });

  server.on("error", (err) => {
    console.warn("[coap] server error:", err.message || "unknown");
  });

  server.listen(port, host, () => {
    console.log(`[coap] listening on coap://${host}:${port}`);
  });
  return server;
}

module.exports = { startCoapIngest, stripAuthFields };
