const { upsertNodeTelemetry } = require("./nodeStore");

function normalizeItems(data) {
  if (Array.isArray(data)) {
    return data;
  }
  if (data && Array.isArray(data.items)) {
    return data.items;
  }
  if (data && Array.isArray(data.nodes)) {
    return data.nodes;
  }
  return [];
}

async function pullOnce(config) {
  if (!config.UPSTREAM_PULL_URL) {
    return { ok: false, reason: "missing_url", count: 0 };
  }

  const headers = {};
  if (config.UPSTREAM_AUTH_TOKEN) {
    headers.Authorization = `Bearer ${config.UPSTREAM_AUTH_TOKEN}`;
  }

  const resp = await fetch(config.UPSTREAM_PULL_URL, { headers });
  if (!resp.ok) {
    return { ok: false, reason: `http_${resp.status}`, count: 0 };
  }

  const data = await resp.json();
  const items = normalizeItems(data);

  let count = 0;
  for (const item of items) {
    upsertNodeTelemetry(item, item?.nodeId || item?.node_id);
    count += 1;
  }

  return { ok: true, count };
}

function startUpstreamPuller(config) {
  if (!config.UPSTREAM_PULL_URL) {
    console.log("[pull] disabled (UPSTREAM_PULL_URL is empty)");
    return;
  }

  const every = Math.max(2000, Number(config.UPSTREAM_PULL_INTERVAL_MS || 8000));
  console.log(`[pull] enabled -> ${config.UPSTREAM_PULL_URL} every ${every}ms`);

  const run = async () => {
    try {
      const result = await pullOnce(config);
      if (!result.ok) {
        console.warn(`[pull] failed: ${result.reason}`);
        return;
      }
      console.log(`[pull] success: ${result.count} records`);
    } catch (err) {
      console.warn(`[pull] error: ${err.message}`);
    }
  };

  run();
  const timer = setInterval(run, every);
  return () => clearInterval(timer);
}

module.exports = {
  pullOnce,
  startUpstreamPuller
};
