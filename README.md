# nRF CoAP/MQTT Data Dashboard

Web dashboard for nRF nodes.  
Data flow: nRF -> CoAP/MQTT -> your server/broker -> this dashboard backend -> web UI.

## What is included

- MQTT ingest from your broker topic (default: `nrf/+/telemetry`)
- CoAP ingest server (default `coap://0.0.0.0:5683`)
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
- GPS map view (OpenStreetMap + Leaflet) with node markers

## Mecho integration profile

This project now supports your current production endpoints directly:

- REST latest snapshot: `https://coap.mecho.top/sensor`
- MQTT WebSocket: `wss://mqtt.mecho.top/mqtt`
- MQTT topic: `sensor/+/data`

`GET /sensor` object-map responses are supported, for example:

```json
{
  "a1b2": {"mac_last4":"a1b2","temperature":30.1,"humidity":55},
  "c3d4": {"mac":"cc:dd:ee:ff:c3:d4","temperature":22.7,"humidity":60},
  "0001": {"device":"ISTAG-0001","temp_c":32,"battery_pct":87}
}
```

Normalization highlights:

- Node id sources: `nodeId`, `device_id`, `mac_last4`, `mac` (auto last-4 extract), or map key fallback
- Temperature aliases: `temperature`, `temp`, `temp_c`
- Battery aliases: `battery`, `battery_mv`, `battery_pct`
- Status aliases: `status`, `state`
- ISTAG fields like `events`, `urgent`, `vibration_mg`, `tilt_deg` are preserved

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

CoAP is enabled by default. You can tune it:

```env
COAP_ENABLED=true
COAP_HOST=0.0.0.0
COAP_PORT=5683
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
  "co2": 611,
  "lat": 31.2304,
  "lng": 121.4737
}
```

If `nodeId` is missing in payload, backend falls back to topic segment (e.g. `nrf-001` from `nrf/nrf-001/telemetry`).
GPS aliases are accepted too: `latitude/longitude`, `lat/lon`, `gps.lat/gps.lon`, `location.latitude/location.longitude`.

## CoAP payload example

Endpoint:

```text
coap://your-server-ip:5683/telemetry
```

Or include node id in path:

```text
coap://your-server-ip:5683/telemetry/nrf-001
```

Method: `POST` or `PUT`  
Payload: JSON (same schema as MQTT payload).

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
