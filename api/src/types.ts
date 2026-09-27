export interface SensorMetadata {
  sensorId: number;
  sensorName: string;
  unit: string;
  validMin?: number;
  validMax?: number;
}

export interface Reading {
  sensorId: number;
  value: number;
  timestamp: number;
  inRange: boolean;
}

export interface QualityStats {
  received: number;
  accepted: number;
  recovered: number;
  dropped: number;
  outOfRange: number;
  dropReasons: Record<string, number>;
  streamConnected: boolean;
}
