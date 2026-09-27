import type { SensorMetadata, TelemetryReading } from '../../lib/api-client';
import { formatAge, formatUnit, formatValue, isStale } from '../../lib/format';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { StatusBadge } from './status-badge';

const CORNERS = [
  { name: 'TYRE_PRESSURE_FL', short: 'FL', position: 'Front left' },
  { name: 'TYRE_PRESSURE_FR', short: 'FR', position: 'Front right' },
  { name: 'TYRE_PRESSURE_RL', short: 'RL', position: 'Rear left' },
  { name: 'TYRE_PRESSURE_RR', short: 'RR', position: 'Rear right' }
] as const;

export function TyrePanel({
  sensors,
  readings,
  now
}: {
  sensors: SensorMetadata[];
  readings: Record<number, TelemetryReading>;
  now: number;
}) {
  const byName = new Map(sensors.map((sensor) => [sensor.sensorName, sensor]));

  return (
    <Card className="border-border bg-secondary/30">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm">Tyre pressures</CardTitle>
        <CardDescription>Front axle on top. Target band is 150–250 kPa.</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 p-4 pt-2">
        {CORNERS.map((corner) => {
          const sensor = byName.get(corner.name);
          const reading = sensor ? readings[sensor.sensorId] : undefined;
          const stale = reading ? isStale(reading.timestamp, now) : false;
          const alert = Boolean(reading && !reading.inRange);

          return (
            <div
              key={corner.name}
              className={`rounded-lg border px-3 py-3 ${
                alert ? 'border-destructive/60 bg-destructive/10' : 'border-border bg-background/40'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  {corner.short}
                </p>
                <StatusBadge reading={reading} stale={stale} />
              </div>
              <p className="mt-2 text-2xl font-semibold tabular-nums">
                {reading && sensor ? formatValue(reading.value, sensor.unit) : '—'}
                {sensor && (
                  <span className="ml-1 text-sm font-normal text-muted-foreground">
                    {formatUnit(sensor.unit)}
                  </span>
                )}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {corner.position}
                {reading ? ` · ${formatAge(reading.timestamp, now)}` : ''}
              </p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
