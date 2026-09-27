import type { TelemetryReading } from '../../lib/api-client';
import { Badge } from '../ui/badge';

export function StatusBadge({
  reading,
  stale
}: {
  reading: TelemetryReading | undefined;
  stale: boolean;
}) {
  if (!reading) return <Badge variant="secondary">Waiting</Badge>;
  if (!reading.inRange) return <Badge variant="destructive">Out of range</Badge>;
  if (stale) return <Badge variant="warning">Stale</Badge>;
  return <Badge variant="success">In range</Badge>;
}
