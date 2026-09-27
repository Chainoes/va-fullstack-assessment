/**
 * Assessment valid-range table. A value outside [min, max] is out of range.
 * Bounds are inclusive. Units here match the brief; the emulator's own unit
 * string is what we return on metadata (for example "C", not "°C").
 */
export interface ValidRange {
  min: number;
  max: number;
}

export const VALID_RANGES: Record<string, ValidRange> = {
  BATTERY_TEMPERATURE: { min: 20, max: 80 },
  MOTOR_TEMPERATURE: { min: 30, max: 120 },
  TYRE_PRESSURE_FL: { min: 150, max: 250 },
  TYRE_PRESSURE_FR: { min: 150, max: 250 },
  TYRE_PRESSURE_RL: { min: 150, max: 250 },
  TYRE_PRESSURE_RR: { min: 150, max: 250 },
  PACK_CURRENT: { min: -300, max: 300 },
  PACK_VOLTAGE: { min: 350, max: 500 },
  PACK_SOC: { min: 0, max: 100 },
  VEHICLE_SPEED: { min: 0, max: 250 },
  STEERING_ANGLE: { min: -180, max: 180 },
  BRAKE_PRESSURE_FRONT: { min: 0, max: 120 }
};

export function rangeFor(sensorName: string): ValidRange | undefined {
  return VALID_RANGES[sensorName];
}

export function isWithinRange(sensorName: string, value: number): boolean {
  const range = VALID_RANGES[sensorName];
  if (!range) return true;
  return value >= range.min && value <= range.max;
}
