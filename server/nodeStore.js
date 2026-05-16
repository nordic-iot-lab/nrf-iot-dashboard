const nodeMap = new Map();

function normalizePayload(payload, fallbackNodeId) {
  const nodeId = String(
    payload.nodeId || payload.node_id || payload.deviceId || payload.device_id || fallbackNodeId || "unknown"
  );

  const now = Date.now();
  return {
    nodeId,
    temperature: payload.temperature ?? payload.temp ?? null,
    humidity: payload.humidity ?? null,
    battery: payload.battery ?? payload.battery_mv ?? null,
    rssi: payload.rssi ?? null,
    voltage: payload.voltage ?? null,
    co2: payload.co2 ?? null,
    pm25: payload.pm25 ?? null,
    raw: payload,
    updatedAt: now
  };
}

function upsertNodeTelemetry(payload, fallbackNodeId) {
  const normalized = normalizePayload(payload, fallbackNodeId);
  const prev = nodeMap.get(normalized.nodeId) || {};
  nodeMap.set(normalized.nodeId, {
    ...prev,
    ...normalized
  });
  return nodeMap.get(normalized.nodeId);
}

function getAllNodes() {
  return Array.from(nodeMap.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

function getNode(nodeId) {
  return nodeMap.get(nodeId);
}

module.exports = {
  upsertNodeTelemetry,
  getAllNodes,
  getNode
};
