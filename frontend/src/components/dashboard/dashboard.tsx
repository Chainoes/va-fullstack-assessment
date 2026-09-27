'use client';

import Image from 'next/image';
import { API_BASE_URL, type SensorMetadata, type TelemetryReading } from '../../lib/api-client';
import { formatSensorName } from '../../lib/format';
import { useTelemetry, type StreamStatus } from '../../lib/use-telemetry';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { KpiCard } from './kpi-card';
import { SensorTable } from './sensor-table';
import { TyrePanel } from './tyre-panel';

const PRIMARY = ['VEHICLE_SPEED', 'PACK_SOC', 'PACK_VOLTAGE', 'PACK_CURRENT'] as const;
const SECONDARY = ['BATTERY_TEMPERATURE', 'MOTOR_TEMPERATURE', 'BRAKE_PRESSURE_FRONT', 'STEERING_ANGLE'] as const;

function streamLabel(status: StreamStatus): string {
  if (status === 'live') return 'Live';
  if (status === 'reconnecting') return 'Reconnecting';
  if (status === 'offline') return 'Stream offline';
  return 'Connecting';
}

function streamVariant(status: StreamStatus): 'success' | 'warning' | 'destructive' | 'secondary' {
  if (status === 'live') return 'success';
  if (status === 'reconnecting') return 'warning';
  if (status === 'offline') return 'destructive';
  return 'secondary';
}

export function Dashboard() {
  const { healthStatus, healthError, sensors, readings, history, streamStatus, loadError, now } =
    useTelemetry();
  const byName = new Map(sensors.map((sensor) => [sensor.sensorName, sensor]));

  const reporting = sensors.filter((sensor) => readings[sensor.sensorId]).length;
  const faults = sensors.filter((sensor) => {
    const reading = readings[sensor.sensorId];
    return reading && !reading.inRange;
  });

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background/80 px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Image src="/logo-darkmode.svg" alt="Spyder" width={32} height={32} />
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Spyder Telemetry</h1>
              <p className="text-xs text-muted-foreground">Live vehicle sensors</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">API {API_BASE_URL.replace(/^https?:\/\//, '')}</Badge>
            <Badge
              variant={
                healthStatus === 'ok' ? 'success' : healthStatus === 'checking' ? 'secondary' : 'destructive'
              }
            >
              {healthStatus === 'ok' ? 'API connected' : healthStatus === 'checking' ? 'Checking API' : 'API unreachable'}
            </Badge>
            <Badge variant={streamVariant(streamStatus)}>{streamLabel(streamStatus)}</Badge>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
        {healthStatus === 'unhealthy' && healthError && (
          <Card className="border-destructive/40 bg-destructive/10">
            <CardHeader className="py-4">
              <CardTitle className="text-sm">Cannot reach API</CardTitle>
              <CardDescription className="text-xs text-destructive-foreground/80">
                {healthError}. Start the stack with docker compose, or run the emulator and API locally.
                The dashboard expects the API at {API_BASE_URL}.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {healthStatus !== 'unhealthy' && loadError && sensors.length === 0 && (
          <Card className="border-destructive/40 bg-destructive/10">
            <CardHeader className="py-4">
              <CardTitle className="text-sm">Sensor catalogue unavailable</CardTitle>
              <CardDescription className="text-xs">{loadError}</CardDescription>
            </CardHeader>
          </Card>
        )}

        <Card className={faults.length > 0 ? 'border-destructive/50 bg-destructive/10' : 'border-border bg-secondary/20'}>
          <CardContent className="flex flex-col gap-1 p-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Vehicle status
              </p>
              <p className="mt-1 text-2xl font-semibold tracking-tight">
                {sensors.length === 0
                  ? 'Waiting for sensors'
                  : faults.length === 0
                    ? 'All reporting sensors in range'
                    : `${faults.length} sensor${faults.length === 1 ? '' : 's'} out of range`}
              </p>
              <p className="text-sm text-muted-foreground">
                {faults.length > 0
                  ? faults.map((sensor) => formatSensorName(sensor.sensorName)).join(', ')
                  : 'Speed, pack state, and temperatures are the channels to watch first.'}
              </p>
            </div>
            <p className="text-sm tabular-nums text-muted-foreground">
              {reporting}/{sensors.length || '—'} reporting
            </p>
          </CardContent>
        </Card>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold tracking-tight">Driving and pack</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {PRIMARY.map((name) => {
              const sensor = byName.get(name);
              return (
                <SensorKpi
                  key={name}
                  name={name}
                  sensor={sensor}
                  readings={readings}
                  history={history}
                  now={now}
                  emphasis={name === 'VEHICLE_SPEED'}
                />
              );
            })}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <TyrePanel sensors={sensors} readings={readings} now={now} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {SECONDARY.map((name) => {
              const sensor = byName.get(name);
              return (
                <SensorKpi
                  key={name}
                  name={name}
                  sensor={sensor}
                  readings={readings}
                  history={history}
                  now={now}
                  compact
                />
              );
            })}
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">All sensors</h2>
            <p className="text-xs text-muted-foreground">
              Names and units come from metadata. Values come from the live stream, reconciled against latest telemetry.
            </p>
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <SensorTable sensors={sensors} readings={readings} now={now} />
          </div>
        </section>
      </div>
    </main>
  );
}

function SensorKpi({
  name,
  sensor,
  readings,
  history,
  now,
  emphasis = false,
  compact = false
}: {
  name: string;
  sensor: SensorMetadata | undefined;
  readings: Record<number, TelemetryReading>;
  history: Record<number, number[]>;
  now: number;
  emphasis?: boolean;
  compact?: boolean;
}) {
  const reading = sensor ? readings[sensor.sensorId] : undefined;
  return (
    <KpiCard
      label={formatSensorName(name)}
      unit={sensor?.unit}
      reading={reading}
      history={sensor ? history[sensor.sensorId] ?? [] : []}
      validMin={sensor?.validMin}
      validMax={sensor?.validMax}
      now={now}
      emphasis={emphasis}
      compact={compact}
    />
  );
}
