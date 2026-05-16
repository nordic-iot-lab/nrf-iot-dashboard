const path = require("path");
const express = require("express");
const dotenv = require("dotenv");
const { startMqttIngest } = require("./mqttClient");
const { startCoapIngest } = require("./coapServer");
const { upsertNodeTelemetry, getAllNodes, getNode } = require("./nodeStore");
const { startUpstreamPuller, pullOnce } = require("./upstreamPuller");
const { createHistoryStore } = require("./historyStore");

dotenv.config();

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "..", "web")));

const config = {
  PORT: Number(process.env.PORT || 8080),
  MQTT_BROKER_URL: process.env.MQTT_BROKER_URL || "mqtt://localhost:1883",
  MQTT_TOPIC: process.env.MQTT_TOPIC || "nrf/+/telemetry",
  MQTT_USERNAME: process.env.MQTT_USERNAME || "",
  MQTT_PASSWORD: process.env.MQTT_PASSWORD || "",
  MQTT_CLIENT_ID: process.env.MQTT_CLIENT_ID || `nordic-web-dashboard-${Date.now()}`,
  COAP_ENABLED: process.env.COAP_ENABLED !== "false",
  COAP_HOST: process.env.COAP_HOST || "0.0.0.0",
  COAP_PORT: Number(process.env.COAP_PORT || 5683),
  UPSTREAM_PULL_URL: process.env.UPSTREAM_PULL_URL || "",
  UPSTREAM_PULL_INTERVAL_MS: Number(process.env.UPSTREAM_PULL_INTERVAL_MS || 8000),
  UPSTREAM_AUTH_TOKEN: process.env.UPSTREAM_AUTH_TOKEN || "",
  PG_ENABLED: process.env.PG_ENABLED === "true",
  PG_HOST: process.env.PG_HOST || "",
  PG_PORT: Number(process.env.PG_PORT || 5432),
  PG_DATABASE: process.env.PG_DATABASE || "",
  PG_USER: process.env.PG_USER || "",
  PG_PASSWORD: process.env.PG_PASSWORD || "",
  PG_SSL: process.env.PG_SSL === "true",
  PG_CONNECT_TIMEOUT_MS: Number(process.env.PG_CONNECT_TIMEOUT_MS || 3000),
  PG_QUERY_TIMEOUT_MS: Number(process.env.PG_QUERY_TIMEOUT_MS || 4000)
};

startMqttIngest(config);
startCoapIngest(config);
startUpstreamPuller(config);
const historyStore = createHistoryStore(config);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "nordic-web-dashboard", ts: Date.now() });
});

app.get("/api/nodes", (_req, res) => {
  res.json({ items: getAllNodes() });
});

app.get("/api/nodes/:nodeId", (req, res) => {
  const found = getNode(req.params.nodeId);
  if (!found) {
    res.status(404).json({ error: "node_not_found" });
    return;
  }
  res.json(found);
});

app.get("/api/nodes/:nodeId/history", async (req, res) => {
  try {
    const nodeId = String(req.params.nodeId || "").toLowerCase();
    const limit = Number(req.query.limit || 100);
    const items = await historyStore.getHistory(nodeId, limit);
    res.json({
      nodeId,
      source: historyStore.isEnabled() ? "postgres" : "disabled",
      items
    });
  } catch (err) {
    res.status(500).json({ error: "history_query_failed", reason: err.message });
  }
});

// Optional ingestion endpoint for your server-side bridge:
// POST /api/ingest with json: { nodeId, temperature, humidity, battery, ... }
app.post("/api/ingest", (req, res) => {
  const saved = upsertNodeTelemetry(req.body || {}, req.body?.nodeId);
  res.json({ ok: true, item: saved });
});

app.post("/api/pull-once", async (_req, res) => {
  try {
    const result = await pullOnce(config);
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, reason: err.message });
  }
});

app.listen(config.PORT, () => {
  console.log(`[http] dashboard running: http://localhost:${config.PORT}`);
});
