function parseNodeIdFromTopic(topic) {
  const parts = String(topic || "")
    .split("/")
    .filter(Boolean);
  if (parts.length >= 2) {
    return String(parts[1]).toLowerCase();
  }
  return "unknown";
}

module.exports = { parseNodeIdFromTopic };
