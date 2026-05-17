function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

const SUFFIXES = [
  "-mqtt-plain",
  "-mqtt-tls",
  "-coap-plain",
  "-coap-dtls"
];

const MODE_LABELS = new Map([
  ["-mqtt-plain", "MQTT PLAIN"],
  ["-mqtt-tls", "MQTT TLS"],
  ["-coap-plain", "COAP PLAIN"],
  ["-coap-dtls", "COAP DTLS"]
]);

const MODE_ORDER = new Map([
  ["COAP DTLS", 0],
  ["MQTT TLS", 1],
  ["COAP PLAIN", 2],
  ["MQTT PLAIN", 3],
  ["DEFAULT", 4]
]);

export function baseNodeId(nodeId) {
  const text = normalizeText(nodeId);
  for (const suffix of SUFFIXES) {
    if (text.endsWith(suffix)) {
      return text.slice(0, -suffix.length);
    }
  }
  return text;
}

export function modeLabel(nodeId) {
  const text = normalizeText(nodeId);
  for (const [suffix, label] of MODE_LABELS.entries()) {
    if (text.endsWith(suffix)) {
      return label;
    }
  }
  return "DEFAULT";
}

export function groupNodesByDevice(items) {
  const groups = new Map();

  for (const item of items || []) {
    const deviceId = baseNodeId(item?.nodeId);
    const existing = groups.get(deviceId) || {
      deviceId,
      updatedAt: 0,
      variants: []
    };
    existing.updatedAt = Math.max(existing.updatedAt, Number(item?.updatedAt ?? 0) || 0);
    existing.variants.push(item);
    groups.set(deviceId, existing);
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      variants: group.variants.slice().sort((a, b) => {
        const aOrder = MODE_ORDER.get(modeLabel(a?.nodeId)) ?? 99;
        const bOrder = MODE_ORDER.get(modeLabel(b?.nodeId)) ?? 99;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return (Number(b?.updatedAt ?? 0) || 0) - (Number(a?.updatedAt ?? 0) || 0);
      })
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
