import type { TelemetryReading } from '../../lib/api-client';
import { formatAge, formatUnit, formatValue, isStale } from '../../lib/format';
import { Card, CardContent, CardHeader } from '../ui/card';
import { RangeMeter } from './range-meter';
import { Sparkline } from './sparkline';
import { StatusBadge } from './status-badge';

export function KpiCard({
  label,
  unit,
  reading,
  history,
  validMin,
  validMax,
  now,
  emphasis = false,
  compact = false
}: {
  label: string;
  unit?: string;
  reading?: TelemetryReading;
  history: number[];
  validMin?: number;
  validMax?: number;
  now: number;
  emphasis?: boolean;
  compact?: boolean;
}) {
  const stale = reading ? isStale(reading.timestamp, now) : false;
  const alert = Boolean(reading && !reading.inRange);

  return (
    <Card className={`bg-secondary/30 ${alert ? 'border-destructive/60' : 'border-border'}`}>
      <CardHeader className="space-y-0 p-4 pb-2">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {emphasis ? 'Primary · ' : ''}
            {label}
          </p>
          <StatusBadge reading={reading} stale={stale} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0">
        <div className="flex items-baseline gap-2">
          <span
            className={`font-semibold tabular-nums tracking-tight ${
              emphasis ? 'text-4xl' : compact ? 'text-2xl' : 'text-3xl'
            }`}
          >
            {reading && unit ? formatValue(reading.value, unit) : '—'}
          </span>
          {unit && <span className="text-sm text-muted-foreground">{formatUnit(unit)}</span>}
        </div>
        <Sparkline values={history} alert={alert} />
        <RangeMeter value={reading?.value} min={validMin} max={validMax} />
        <p className="text-[11px] text-muted-foreground">
          {reading ? formatAge(reading.timestamp, now) : 'No sample yet'}
          {validMin !== undefined && validMax !== undefined && unit
            ? ` · ${validMin}–${validMax} ${formatUnit(unit)}`
            : ''}
        </p>
      </CardContent>
    </Card>
  );
}
