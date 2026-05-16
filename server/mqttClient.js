const mqtt = require("mqtt");
const { upsertNodeTelemetry } = require("./nodeStore");
const { parseNodeIdFromTopic } = require("./topicParser");

function startMqttIngest(config) {
  const client = mqtt.connect(config.MQTT_BROKER_URL, {
    username: config.MQTT_USERNAME || undefined,
    password: config.MQTT_PASSWORD || undefined,
    clientId: config.MQTT_CLIENT_ID,
    reconnectPeriod: 5000,
    connectTimeout: 4000
  });

  client.on("connect", () => {
    console.log(`[mqtt] connected -> ${config.MQTT_BROKER_URL}`);
    client.subscribe(config.MQTT_TOPIC, (err) => {
      if (err) {
        console.error("[mqtt] subscribe failed:", err.message);
        return;
      }
      console.log(`[mqtt] subscribed topic: ${config.MQTT_TOPIC}`);
    });
  });

  client.on("message", (topic, message) => {
    const text = message.toString("utf-8");
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (err) {
      console.warn(`[mqtt] invalid json on topic ${topic}: ${text}`);
      return;
    }

    const topicNodeId = parseNodeIdFromTopic(topic);
    const saved = upsertNodeTelemetry(payload, topicNodeId, { source: "mqtt" });
    console.log(`[mqtt] node=${saved.nodeId} temp=${saved.temperature} hum=${saved.humidity} battery=${saved.battery}`);
  });

  client.on("error", (err) => {
    console.warn("[mqtt] client error:", err.message || "unknown");
  });

  client.on("offline", () => {
    console.warn("[mqtt] offline, waiting reconnect...");
  });

  client.on("reconnect", () => {
    console.log("[mqtt] reconnecting...");
  });

  return client;
}

module.exports = { startMqttIngest };
