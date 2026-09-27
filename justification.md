# Vehicle Analytics Fullstack Assessment – Justification

## API

### 1. Overall API design

The API is a stateful edge in front of a stateless emulator. It owns the latest-value cache, validation, and the valid-range table. The emulator is only a source.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Emulator HTTP reachability plus whether the telemetry WebSocket is connected |
| GET | `/sensors` | Metadata: `sensorId`, `sensorName`, `unit`, and the API's `validMin` / `validMax` |
| GET | `/telemetry/latest` | Latest accepted reading for every sensor that has one |
| GET | `/telemetry/latest/{sensorId}` | Same, for one sensor |
| GET | `/telemetry/stream` | Server-Sent Events. Each `reading` event is one accepted sample |
| GET | `/telemetry/quality` | Counters for received, recovered, dropped, and out-of-range frames |
| GET | `/docs` | Swagger UI |
| GET | `/openapi.yaml` | The spec itself |

A reading is `{ sensorId, value, timestamp, inRange }`. `timestamp` stays in unix seconds, matching the emulator. `inRange` is computed by the API so clients do not reimplement the table to colour a value, but they still need `/sensors` for the name and unit.

Errors use `{ error, code }` with 400, 404, or 503.

### 2. Data vs metadata separation

Clients call `GET /sensors` once (the dashboard refreshes it every 30 seconds in case the process restarted). They render names, units, and range labels from that catalogue.

They then either:

- open `GET /telemetry/stream` and apply each `reading` event, or
- poll `GET /telemetry/latest`.

The dashboard does both: the stream is the live path, and a 5 second poll reconciles anything missed across a reconnect. Readings do not embed `sensorName` or `unit`, so a client that skips metadata cannot label a channel.

`/health` stays a liveness check. It does not return telemetry.

### 3. Emulator (read-only)

The emulator service and `emulator/src/sensor-config.json` were not modified. The API discovers sensors from `GET {EMULATOR_URL}/sensors` and consumes `WS {EMULATOR_URL}/ws/telemetry`. On disconnect it backs off and reconnects. Metadata is loaded before the socket opens, and refreshed every 60 seconds. A failed refresh keeps the last good catalogue.

`validMin` / `validMax` are not taken from the emulator. The emulator does not expose them. They are joined from the assessment table inside the API, keyed by `sensorName`.

### 4. OpenAPI / Swagger

- Spec: `api/openapi.yaml` (same document copied to `openapi.yaml` at the repo root).
- Swagger UI: [http://localhost:4000/docs](http://localhost:4000/docs) while the API is running.
- Raw spec: [http://localhost:4000/openapi.yaml](http://localhost:4000/openapi.yaml).

### 5. Testing and error handling

Unit tests live next to the logic and run with `npm test` in `api/`:

- recoverable numeric strings versus drop-worthy garbage and a missing `sensorId`
- the 5 second window: 3 samples do not alert, the 4th does, a sample exactly 5 seconds old still counts, and sensors do not share a window
- the hub stores out-of-range values, refuses to publish invalid ones, and only logs the sensor that actually crossed the threshold

HTTP failures use a single error shape. The emulator client retries metadata and the WebSocket independently. A malformed JSON frame is counted as `malformed_json` and dropped. Unknown routes return 404.

### 6. Invalid data from the emulator (Task 2)

Detection is structural, not a guess about "looking wrong":

- the payload must be an object
- `sensorId` must be a safe integer, or a string of digits (the emulator sometimes sends the id as a string)
- `value` and `timestamp` must be finite numbers, or numeric strings such as `"61.250"`
- strings that are not plain decimals (`12X34`, `NaNish…`) are rejected
- extra fields are ignored
- a `sensorId` that is not in the catalogue is rejected

Recoverable frames are coerced, counted as `recovered`, and then treated as normal readings. Unrecoverable frames are not stored as latest and are not written to the SSE stream. They are counted on `GET /telemetry/quality` by reason (`missing_sensor_id`, `invalid_value`, `malformed_json`, and so on). A one-line warning every 10 seconds summarises how many were dropped, so those logs do not bury the out-of-range errors.

Coercion is worth doing because two of the emulator's bad formats are unambiguous numbers in the wrong JSON type. Guessing at a non-numeric token would invent a value, so those frames are dropped.

### 7. Out-of-range values per sensor (Task 3)

`api/src/ranges.ts` is the assessment table, keyed by sensor name. Bounds are inclusive. An accepted reading outside `[min, max]` is still stored and streamed with `inRange: false`, because the value is a real sample and the dashboard needs to show the fault. Format errors and range errors are different problems.

Each out-of-range sample is pushed into a per-sensor list of event times, using the reading timestamp. Samples older than 5 seconds relative to the latest event for that sensor are discarded. When the window length is greater than 3, the API prints one line to stderr:

```text
[2026-09-27T12:00:00.000Z] ERROR BATTERY_TEMPERATURE (sensorId 1000000070501) out of range 4 times in 5s. Value 93.000 C is outside 20–80.
```

The timestamp in that line is the wall clock at the moment of the log (`new Date().toISOString()`), not the sample time. The sensor name and numeric id are both included. The 4th sample in the window logs, and so does each further sample while the window stays above 3. A later isolated spike, after the earlier ones have aged out, does not log. In-range samples do not enter the window. Sensors do not share counters.

### Design trade-offs

- SSE instead of a second WebSocket. Browsers already speak it, and it is easy to describe in OpenAPI. Polling remains available for clients that cannot hold a stream.
- Latest-only storage. The emulator is the history-free source of truth for "now". Short sparklines are kept in the browser, not in the API. A time-series store would be the next step if engineers needed to scroll back.
- Out-of-range values are shown, not dropped. Dropping them would hide the fault the console warning is describing.
- Quality warnings are aggregated every 10 seconds so Task 3 lines stay readable in `docker compose` logs.

## Frontend

### 1. Figma mockup

- Low-fidelity mockup of the single dashboard screen: [Figma](https://www.figma.com/design/jvaTnFtPHipGyJRgwryT53/Untitled?node-id=1-2&t=loQWtNusdh5ocpDA-1). The same drawing is also in `docs/dashboard-wireframe.svg`.
- It covers the header, vehicle-status summary, four primary channels (speed called out as primary, one card drawn out of range), the tyre grid with the front axle on top, the four thermal/chassis cards, and the full sensor table.

### 2. Layout and information hierarchy

The page answers "is the car okay?" before it answers "what is every channel doing?".

1. A status line names how many sensors are out of range, and which ones.
2. Speed, state of charge, pack voltage, and pack current are the large cards. Speed is marked primary because it is the value a driver or engineer checks first.
3. Tyre pressures sit in a front/rear grid so a low corner is obvious without reading four names.
4. Battery temperature, motor temperature, brake pressure, and steering angle sit beside the tyres.
5. The table lists every channel with its id, value, valid range, status, and age, for someone who wants the raw catalogue.

Status is a word (`In range`, `Out of range`, `Stale`, `Waiting`) as well as a colour. A marker on each card shows where the value sits inside the published min/max.

### 3. API consumption

- `GET /sensors` resolves `sensorId` to `sensorName`, `unit`, and the valid range. The table and cards never hard-code those labels.
- `GET /telemetry/latest` fills the first paint and is polled every 5 seconds.
- `EventSource` on `GET /telemetry/stream` applies each `reading` and appends it to a short in-browser history for the sparkline.
- `GET /health` drives the API badge only. It is not used as a data source.

A poll response is ignored when its timestamp is older than the reading already on screen, so a slow response cannot rewind a live card.

### 4. Visual design and usability

The scaffold's dark theme and shadcn `Card` / `Badge` components are the layout system. Green means in range, red means out of range, and a neutral badge means waiting. Values use tabular figures so digits do not jump. Temperatures displayed as `C` from the API are shown as `°C`. Tyre pressures are whole kPa; other channels use one decimal place. The header, KPI row, and tyre grid collapse to a single column on a narrow viewport. The table scrolls horizontally instead of squeezing the sensor id.

### 5. Trade-offs and limitations

- History is the last 40 samples in the browser. A reload clears the sparklines. The latest value comes back from the API immediately.
- "Stale" means the sample timestamp is more than 4 seconds old. The slowest emulator interval is about 1.1 seconds, so 4 seconds means several missed samples, not one slow sensor.
- The wireframe matches the built screen. It is a single static frame, so it does not show hover or empty states.
- There is no authentication. The API is open on port 4000, which matches the assessment setup.
