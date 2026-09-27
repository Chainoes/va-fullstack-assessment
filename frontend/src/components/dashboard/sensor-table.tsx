import type { SensorMetadata, TelemetryReading } from '../../lib/api-client';
import { formatAge, formatRange, formatSensorName, formatUnit, formatValue, isStale } from '../../lib/format';
import { StatusBadge } from './status-badge';

export function SensorTable({
  sensors,
  readings,
  now
}: {
  sensors: SensorMetadata[];
  readings: Record<number, TelemetryReading>;
  now: number;
}) {
  if (sensors.length === 0) {
    return (
      <div className="flex min-h-[120px] items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Waiting for the sensor catalogue from the API.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-border text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Sensor</th>
            <th className="px-4 py-3 font-medium">Value</th>
            <th className="px-4 py-3 font-medium">Valid range</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Updated</th>
          </tr>
        </thead>
        <tbody>
          {sensors.map((sensor) => {
            const reading = readings[sensor.sensorId];
            const stale = reading ? isStale(reading.timestamp, now) : false;
            return (
              <tr key={sensor.sensorId} className="border-b border-border/70 last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium">{formatSensorName(sensor.sensorName)}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">{sensor.sensorId}</div>
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {reading ? (
                    <>
                      {formatValue(reading.value, sensor.unit)}{' '}
                      <span className="text-muted-foreground">{formatUnit(sensor.unit)}</span>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {sensor.validMin !== undefined && sensor.validMax !== undefined
                    ? formatRange(sensor.validMin, sensor.validMax, sensor.unit)
                    : '—'}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge reading={reading} stale={stale} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {reading ? formatAge(reading.timestamp, now) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
