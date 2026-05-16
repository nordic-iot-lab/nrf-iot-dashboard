# nRF CoAP/MQTT Data Dashboard

Web dashboard for nRF nodes.  
Data flow: nRF -> CoAP/MQTT -> your server/broker -> this dashboard backend -> web UI.

## What is included

- MQTT ingest from your broker topic (default: `nrf/+/telemetry`)
- Optional HTTP ingest endpoint for bridge service: `POST /api/ingest`
- Optional puller from your own server endpoint: `UPSTREAM_PULL_URL`
- Node telemetry APIs:
  - `GET /api/health`
- `GET /api/nodes`
- `GET /api/nodes/:nodeId`
- `POST /api/pull-once` (manual pull from your upstream)
- Frontend page for per-node metrics display:
  - temperature
  - humidity
  - battery
  - rssi
  - voltage
  - co2

## Quick start

```bash
npm install
cp .env.example .env
npm run dev
```

Open:

```text
http://localhost:8080
```

If you want this app to pull from your server:

```env
UPSTREAM_PULL_URL=https://your-server.example.com/api/nrf/latest
UPSTREAM_PULL_INTERVAL_MS=8000
UPSTREAM_AUTH_TOKEN=your_token_if_needed
```

## MQTT payload example

Topic example:

```text
nrf/nrf-001/telemetry
```

Payload example:

```json
{
  "nodeId": "nrf-001",
  "temperature": 24.6,
  "humidity": 53.1,
  "battery": 3710,
  "rssi": -65,
  "voltage": 3.71,
  "co2": 611
}
```

If `nodeId` is missing in payload, backend falls back to topic segment (e.g. `nrf-001` from `nrf/nrf-001/telemetry`).

## HTTP ingest example

```bash
curl -X POST http://localhost:8080/api/ingest \
  -H "Content-Type: application/json" \
  -d '{"nodeId":"nrf-002","temperature":26.2,"humidity":49.8,"battery":3660}'
```

## Upstream response accepted formats

Any of the following:

```json
[{"nodeId":"nrf-001","temperature":24.8}]
```

```json
{"items":[{"nodeId":"nrf-001","temperature":24.8}]}
```

```json
{"nodes":[{"nodeId":"nrf-001","temperature":24.8}]}
```
