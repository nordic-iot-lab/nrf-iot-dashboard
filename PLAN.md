# nRF CoAP/MQTT Web Project Plan

## 1. Goal

Build a web system that pulls nRF node data from your server path (MQTT and/or HTTP bridge), then displays required parameters by node.

## 2. Scope

- In-scope:
  - Real-time ingestion from MQTT topic
  - Server-side normalization by node id
  - Node list and node detail APIs
  - Web dashboard with node filter/sort/auto-refresh
  - Basic version management (git + semantic tags)
- Future (next milestone):
  - Auth (JWT or basic SSO)
  - Persistent DB (PostgreSQL/TimescaleDB)
  - Alerts (battery low, offline node, threshold breaches)
  - Trend charts and historical query windows

## 3. Proposed architecture

1. Data ingestion layer
   - Input A: MQTT from broker (`nrf/+/telemetry`)
   - Input B: HTTP ingest endpoint from your existing server bridge
   - Input C: Active pull from your server REST path (`UPSTREAM_PULL_URL`)
2. Normalization layer
   - Standard fields: `nodeId`, `temperature`, `humidity`, `battery`, `rssi`, `voltage`, `co2`, `updatedAt`
3. API layer
   - `GET /api/nodes` (all latest node snapshots)
   - `GET /api/nodes/:nodeId` (single node snapshot)
   - `POST /api/pull-once` (manual pull trigger)
4. Web layer
   - Node cards
   - Search/filter by node id
   - Sort by latest/temp/battery
   - Auto polling (3s)

## 4. Data contract (v1)

Recommended payload:

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

Fallback logic:
- If payload has no `nodeId`, extract node id from topic second segment.

## 5. Delivery phases

1. Phase A (done in this version)
   - Local runnable backend + frontend
   - MQTT ingest + HTTP ingest + upstream pull + node dashboard
2. Phase B
   - Connect to your actual broker and server route
   - Add mapping table for custom parameters per node type
3. Phase C
   - Add DB persistence and historical charts
   - Add alert rules and event logs
4. Phase D
   - Production deployment, monitoring, backup, rollback plan

## 6. Version management strategy

- Branch model:
  - `main`: stable releases
  - `feature/*`: new function development
  - `fix/*`: bug fixes
- Versioning:
  - Semantic versioning (`MAJOR.MINOR.PATCH`)
  - Current baseline: `v0.1.0` (MVP)
- Tagging:
  - Tag every milestone release
- Commit convention:
  - `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`

## 7. Next action checklist

1. Fill `.env` with your real MQTT broker and topic
2. Confirm final telemetry fields for each nRF node model
3. Decide persistence target (PostgreSQL/Redis/InfluxDB)
4. Decide deployment target (your VM, Docker, or k8s)
