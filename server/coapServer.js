const coap = require("coap");
const { upsertNodeTelemetry } = require("./nodeStore");

function getNodeIdFromPath(urlPath) {
  const parts = String(urlPath || "").split("/").filter(Boolean);
  if (parts.length >= 2 && parts[0] === "telemetry") {
    return parts[1];
  }
  return "unknown";
}

function startCoapIngest(config) {
  if (!config.COAP_ENABLED) {
    console.log("[coap] disabled");
    return;
  }

  const port = Number(config.COAP_PORT || 5683);
  const host = config.COAP_HOST || "0.0.0.0";
  const server = coap.createServer();

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

    const fallbackNodeId = getNodeIdFromPath(pathName);
    const saved = upsertNodeTelemetry(payload, fallbackNodeId, { source: "coap" });

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

module.exports = { startCoapIngest };
