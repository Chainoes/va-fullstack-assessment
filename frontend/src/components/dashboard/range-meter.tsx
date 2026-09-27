export function RangeMeter({
  value,
  min,
  max
}: {
  value: number | undefined;
  min: number | undefined;
  max: number | undefined;
}) {
  if (value === undefined || min === undefined || max === undefined) {
    return <div className="h-1.5 rounded-full bg-muted" />;
  }

  const span = max - min || 1;
  const raw = ((value - min) / span) * 100;
  const percent = Math.min(100, Math.max(0, raw));
  const outOfRange = value < min || value > max;

  return (
    <div className="relative h-1.5 rounded-full bg-muted" aria-hidden>
      <div
        className={`absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full ${
          outOfRange ? 'bg-destructive' : 'bg-success'
        }`}
        style={{ left: `calc(${percent}% - 5px)` }}
      />
    </div>
  );
}
