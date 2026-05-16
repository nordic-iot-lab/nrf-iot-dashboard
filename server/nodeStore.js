const nodeMap = new Map();

function toNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sanitizeLat(value) {
  const n = toNumber(value);
  if (n === null) return null;
  if (n < -90 || n > 90) return null;
  return n;
}

function sanitizeLng(value) {
  const n = toNumber(value);
  if (n === null) return null;
  if (n < -180 || n > 180) return null;
  return n;
}

function extractCoordinates(payload) {
  const gps = payload.gps || {};
  const location = payload.location || {};
  const position = payload.position || {};

  let lat = sanitizeLat(
    payload.lat ??
      payload.latitude ??
      payload.gps_lat ??
      payload.gpsLat ??
      gps.lat ??
      gps.latitude ??
      location.lat ??
      location.latitude ??
      position.lat ??
      position.latitude
  );

  let lng = sanitizeLng(
    payload.lng ??
      payload.lon ??
      payload.longitude ??
      payload.gps_lng ??
      payload.gps_lon ??
      payload.gpsLon ??
      payload.gpsLng ??
      gps.lng ??
      gps.lon ??
      gps.longitude ??
      location.lng ??
      location.lon ??
      location.longitude ??
      position.lng ??
      position.lon ??
      position.longitude
  );

  // Support a compact "gps": "lat,lng" string format.
  if ((lat === null || lng === null) && typeof payload.gps === "string") {
    const parts = payload.gps.split(",").map((x) => x.trim());
    if (parts.length >= 2) {
      lat = lat === null ? sanitizeLat(parts[0]) : lat;
      lng = lng === null ? sanitizeLng(parts[1]) : lng;
    }
  }

  return { lat, lng };
}

function normalizePayload(payload, fallbackNodeId) {
  const nodeId = String(
    payload.nodeId || payload.node_id || payload.deviceId || payload.device_id || fallbackNodeId || "unknown"
  );
  const { lat, lng } = extractCoordinates(payload);

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
    lat,
    lng,
    raw: payload,
    updatedAt: now
  };
}

function upsertNodeTelemetry(payload, fallbackNodeId) {
  const normalized = normalizePayload(payload, fallbackNodeId);
  const prev = nodeMap.get(normalized.nodeId) || {};
  const merged = {
    ...prev,
    ...normalized
  };

  // Keep last known position if this packet doesn't include GPS.
  if (normalized.lat === null && prev.lat !== undefined) {
    merged.lat = prev.lat;
  }
  if (normalized.lng === null && prev.lng !== undefined) {
    merged.lng = prev.lng;
  }

  nodeMap.set(normalized.nodeId, merged);
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
