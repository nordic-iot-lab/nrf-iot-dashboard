const nodeMap = new Map();
const nodeHistoryMap = new Map();
const MAX_NODE_HISTORY = 300;
const MAX_SOURCE_RAW_BYTES = 120000;
const MAX_HISTORY_RAW_BYTES = 32000;

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

function safeStableStringify(value, maxBytes) {
  const str = stableStringify(value);
  if (str.length <= maxBytes) {
    return str;
  }
  return str.slice(0, maxBytes);
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
  if (n === 0) return null;
  if (n < -90 || n > 90) return null;
  return n;
}

function sanitizeLng(value) {
  const n = toNumber(value);
  if (n === null) return null;
  if (n === 0) return null;
  if (n < -180 || n > 180) return null;
  return n;
}

function readPath(payload, path) {
  let current = payload;

  for (const segment of path) {
    if (
      current === null ||
      current === undefined ||
      typeof current !== "object" ||
      !Object.prototype.hasOwnProperty.call(current, segment)
    ) {
      return { found: false, value: undefined };
    }
    current = current[segment];
  }

  return { found: true, value: current };
}

function pickCoordinate(payload, candidates, sanitizer) {
  for (const path of candidates) {
    const { found, value } = readPath(payload, path);
    if (found) {
      return {
        provided: true,
        value: sanitizer(value)
      };
    }
  }

  return { provided: false, value: null };
}

function extractCoordinates(payload) {
  const latCandidates = [
    ["lat"],
    ["latitude"],
    ["gps_lat"],
    ["gpsLat"],
    ["gps", "lat"],
    ["gps", "latitude"],
    ["location", "lat"],
    ["location", "latitude"],
    ["position", "lat"],
    ["position", "latitude"]
  ];
  const lngCandidates = [
    ["lng"],
    ["lon"],
    ["longitude"],
    ["gps_lng"],
    ["gps_lon"],
    ["gpsLon"],
    ["gpsLng"],
    ["gps", "lng"],
    ["gps", "lon"],
    ["gps", "longitude"],
    ["location", "lng"],
    ["location", "lon"],
    ["location", "longitude"],
    ["position", "lng"],
    ["position", "lon"],
    ["position", "longitude"]
  ];

  let lat = pickCoordinate(payload, latCandidates, sanitizeLat);
  let lng = pickCoordinate(payload, lngCandidates, sanitizeLng);

  // Support a compact "gps": "lat,lng" string format.
  if ((!lat.provided || !lng.provided) && typeof payload.gps === "string") {
    const parts = payload.gps.split(",").map((x) => x.trim());
    if (parts.length >= 2) {
      if (!lat.provided) {
        lat = { provided: true, value: sanitizeLat(parts[0]) };
      }
      if (!lng.provided) {
        lng = { provided: true, value: sanitizeLng(parts[1]) };
      }
    }
  }

  return {
    lat: lat.value,
    lng: lng.value,
    latProvided: lat.provided,
    lngProvided: lng.provided
  };
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
  const sourcePayload = payload && typeof payload === "object" ? payload : {};
  const nodeId = resolveNodeId(payload, fallbackNodeId);
  const { lat, lng, latProvided, lngProvided } = extractCoordinates(sourcePayload);
  return {
    nodeId,
    temperature: sourcePayload.temperature ?? sourcePayload.temp ?? sourcePayload.temp_c ?? sourcePayload.tempC ?? null,
    humidity: sourcePayload.humidity ?? sourcePayload.humi ?? sourcePayload.hum ?? null,
    battery:
      sourcePayload.battery ??
      sourcePayload.battery_mv ??
      sourcePayload.battery_pct ??
      sourcePayload.batteryPercent ??
      null,
    rssi: sourcePayload.rssi ?? sourcePayload.signal_dbm ?? null,
    voltage: sourcePayload.voltage ?? sourcePayload.vbat ?? sourcePayload.vbat_v ?? null,
    co2: sourcePayload.co2 ?? null,
    pm25: sourcePayload.pm25 ?? null,
    status: sourcePayload.status ?? sourcePayload.state ?? null,
    events: sourcePayload.events ?? null,
    urgent: sourcePayload.urgent ?? null,
    vibrationMg: sourcePayload.vibration_mg ?? sourcePayload.vibrationMg ?? null,
    tiltDeg: sourcePayload.tilt_deg ?? sourcePayload.tiltDeg ?? null,
    lat,
    lng,
    raw: sourcePayload,
    latProvided,
    lngProvided
  };
}

function shouldBumpDeviceSeen(source, isSnapshot) {
  if (isSnapshot) return false;
  const normalized = String(source || "")
    .trim()
    .toLowerCase();
  if (!normalized || normalized === "unknown" || normalized === "rest") {
    return false;
  }
  return true;
}

function normalizeSourceName(source) {
  return String(source || "")
    .trim()
    .toLowerCase();
}

function appendNodeHistory(nodeId, point) {
  const key = normalizeStringId(nodeId) || "unknown";
  const prev = nodeHistoryMap.get(key) || [];
  const next = prev.length >= MAX_NODE_HISTORY ? prev.slice(prev.length - MAX_NODE_HISTORY + 1) : prev.slice();
  next.push(point);
  nodeHistoryMap.set(key, next);
}

function trimRawPayload(raw, maxBytes) {
  if (raw === null || raw === undefined) return raw;
  if (typeof raw === "string") {
    return raw.length > maxBytes ? raw.slice(0, maxBytes) : raw;
  }
  if (typeof raw !== "object") return raw;
  const text = safeStableStringify(raw, maxBytes);
  try {
    return JSON.parse(text);
  } catch {
    return { _truncated: true, _text: text };
  }
}

function upsertNodeTelemetry(payload, fallbackNodeId, options = {}) {
  const source = options.source || "unknown";
  const isSnapshot = options.isSnapshot === true;
  const restoredFromStorage = options.restoredFromStorage === true;
  const normalizedSource = normalizeSourceName(source) || "unknown";
  const normalized = normalizePayload(payload, fallbackNodeId);
  const prev = nodeMap.get(normalized.nodeId) || {};
  const observedAt = Number(options.observedAt);
  const now = Number.isFinite(observedAt) && observedAt > 0 ? observedAt : Date.now();
  const { latProvided, lngProvided, ...normalizedTelemetry } = normalized;
  const merged = {
    ...prev,
    ...normalizedTelemetry
  };

  // Keep last known position only when GPS fields are absent.
  // Explicit 0/invalid coordinates clear stale location instead of reusing it.
  if (latProvided) {
    merged.lat = normalized.lat;
  } else if (prev.lat !== undefined) {
    merged.lat = prev.lat;
  }
  if (lngProvided) {
    merged.lng = normalized.lng;
  } else if (prev.lng !== undefined) {
    merged.lng = prev.lng;
  }

  const prevRaw = prev.raw || null;
  const changed = stableStringify(prevRaw) !== stableStringify(normalized.raw || null);
  merged.lastSeenAt = now;
  const isDeviceSource = shouldBumpDeviceSeen(normalizedSource, isSnapshot);
  merged.lastDeviceSeenAt = isDeviceSource ? now : prev.lastDeviceSeenAt || null;
  merged.updatedAt = changed ? now : prev.updatedAt || now;
  merged.lastSource = isDeviceSource ? normalizedSource : prev.lastSource || "unknown";
  merged.lastSnapshotSource = isSnapshot ? normalizedSource : prev.lastSnapshotSource || null;
  merged.restoredFromStorage = isDeviceSource && !restoredFromStorage ? false : prev.restoredFromStorage || restoredFromStorage;

  const sourceUpdatedAt = { ...(prev.sourceUpdatedAt || {}) };
  const prevSourceRaw = prev.sourceRaw && prev.sourceRaw[normalizedSource] ? prev.sourceRaw[normalizedSource] : null;
  const currentSourceRaw = trimRawPayload(normalized.raw || null, MAX_SOURCE_RAW_BYTES);
  const sourceChanged = safeStableStringify(prevSourceRaw, MAX_SOURCE_RAW_BYTES) !== safeStableStringify(currentSourceRaw, MAX_SOURCE_RAW_BYTES);
  sourceUpdatedAt[normalizedSource] = sourceChanged ? now : sourceUpdatedAt[normalizedSource] || now;
  merged.sourceUpdatedAt = sourceUpdatedAt;

  const sourceLastSeenAt = { ...(prev.sourceLastSeenAt || {}) };
  sourceLastSeenAt[normalizedSource] = now;
  merged.sourceLastSeenAt = sourceLastSeenAt;

  const sourceRaw = { ...(prev.sourceRaw || {}) };
  sourceRaw[normalizedSource] = currentSourceRaw;
  merged.sourceRaw = sourceRaw;

  nodeMap.set(normalized.nodeId, merged);
  appendNodeHistory(normalized.nodeId, {
    nodeId: normalized.nodeId,
    timestamp: now,
    temperature: merged.temperature ?? null,
    humidity: merged.humidity ?? null,
    battery: merged.battery ?? null,
    source: normalizedSource,
    raw: trimRawPayload(normalized.raw || {}, MAX_HISTORY_RAW_BYTES)
  });
  return nodeMap.get(normalized.nodeId);
}

function getAllNodes() {
  return Array.from(nodeMap.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

function buildSensorSnapshotMap() {
  const out = {};
  for (const item of getAllNodes()) {
    const source =
      String(item.lastSource || "").trim().toLowerCase() ||
      String(item.lastSnapshotSource || "").trim().toLowerCase() ||
      "unknown";

    out[item.nodeId] = {
      nodeId: item.nodeId,
      temperature: item.temperature ?? null,
      humidity: item.humidity ?? null,
      battery: item.battery ?? null,
      rssi: item.rssi ?? null,
      voltage: item.voltage ?? null,
      co2: item.co2 ?? null,
      pm25: item.pm25 ?? null,
      status: item.status ?? null,
      events: item.events ?? null,
      urgent: item.urgent ?? null,
      vibration_mg: item.vibrationMg ?? null,
      tilt_deg: item.tiltDeg ?? null,
      lat: item.lat ?? null,
      lng: item.lng ?? null,
      source,
      updatedAt: item.updatedAt ?? null,
      lastSeenAt: item.lastSeenAt ?? null,
      lastDeviceSeenAt: item.lastDeviceSeenAt ?? null
    };
  }
  return out;
}

function pruneSnapshotNodes(snapshotNodeIds, snapshotSource = "rest") {
  const keep = new Set(
    Array.from(snapshotNodeIds || [])
      .map((x) => normalizeStringId(x))
      .filter(Boolean)
  );
  const src = normalizeSourceName(snapshotSource) || "rest";

  for (const [nodeId, node] of nodeMap.entries()) {
    if (keep.has(nodeId)) continue;

    const sourceKeys = Object.keys(node.sourceLastSeenAt || {});
    const onlySnapshotSource = sourceKeys.length === 1 && sourceKeys[0] === src;
    if (!onlySnapshotSource) continue;

    nodeMap.delete(nodeId);
    nodeHistoryMap.delete(nodeId);
  }
}

function getNode(nodeId) {
  const key = normalizeStringId(nodeId);
  return nodeMap.get(key);
}

function getNodeHistory(nodeId, limit = 100) {
  const key = normalizeStringId(nodeId) || "unknown";
  const all = nodeHistoryMap.get(key) || [];
  const safeLimit = Math.max(1, Math.min(500, Number(limit || 100)));
  return all.slice(-safeLimit).reverse();
}

function resetStore() {
  nodeMap.clear();
  nodeHistoryMap.clear();
}

module.exports = {
  upsertNodeTelemetry,
  getAllNodes,
  buildSensorSnapshotMap,
  pruneSnapshotNodes,
  getNode,
  getNodeHistory,
  resetStore
};
