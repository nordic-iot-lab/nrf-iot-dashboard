const nodeMap = new Map();

function stableNormalize(value) {
  if (Array.isArray(value)) {
    return value.map(stableNormalize);
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    const out = {};
    for (const key of keys) {
      out[key] = stableNormalize(value[key]);
    }
    return out;
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableNormalize(value));
}

function normalizeStringId(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim().toLowerCase();
}

function extractMacLast4(value) {
  if (!value) return "";
  const compact = String(value)
    .toLowerCase()
    .replace(/[^a-f0-9]/g, "");
  if (compact.length < 4) return "";
  return compact.slice(-4);
}

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

function resolveNodeId(payload, fallbackNodeId) {
  const direct =
    payload.nodeId ??
    payload.node_id ??
    payload.deviceId ??
    payload.device_id ??
    payload.mac_last4 ??
    payload.macLast4 ??
    extractMacLast4(payload.mac);

  const normalizedDirect = normalizeStringId(direct);
  if (normalizedDirect) return normalizedDirect;

  const normalizedFallback = normalizeStringId(fallbackNodeId);
  if (normalizedFallback) return normalizedFallback;

  return "unknown";
}

function normalizePayload(payload, fallbackNodeId) {
  const nodeId = resolveNodeId(payload, fallbackNodeId);
  const { lat, lng } = extractCoordinates(payload);
  return {
    nodeId,
    temperature: payload.temperature ?? payload.temp ?? payload.temp_c ?? payload.tempC ?? null,
    humidity: payload.humidity ?? payload.humi ?? payload.hum ?? null,
    battery: payload.battery ?? payload.battery_mv ?? payload.battery_pct ?? payload.batteryPercent ?? null,
    rssi: payload.rssi ?? payload.signal_dbm ?? null,
    voltage: payload.voltage ?? payload.vbat ?? payload.vbat_v ?? null,
    co2: payload.co2 ?? null,
    pm25: payload.pm25 ?? null,
    status: payload.status ?? payload.state ?? null,
    events: payload.events ?? null,
    urgent: payload.urgent ?? null,
    vibrationMg: payload.vibration_mg ?? payload.vibrationMg ?? null,
    tiltDeg: payload.tilt_deg ?? payload.tiltDeg ?? null,
    lat,
    lng,
    raw: payload
  };
}

function upsertNodeTelemetry(payload, fallbackNodeId) {
  const normalized = normalizePayload(payload, fallbackNodeId);
  const prev = nodeMap.get(normalized.nodeId) || {};
  const now = Date.now();
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

  const prevRaw = prev.raw || null;
  const changed = stableStringify(prevRaw) !== stableStringify(normalized.raw || null);
  merged.lastSeenAt = now;
  merged.updatedAt = changed ? now : prev.updatedAt || now;

  nodeMap.set(normalized.nodeId, merged);
  return nodeMap.get(normalized.nodeId);
}

function getAllNodes() {
  return Array.from(nodeMap.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

function getNode(nodeId) {
  return nodeMap.get(nodeId);
}

function resetStore() {
  nodeMap.clear();
}

module.exports = {
  upsertNodeTelemetry,
  getAllNodes,
  getNode,
  resetStore
};
