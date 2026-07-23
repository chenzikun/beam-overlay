import type { SensorDef } from './types'

/**
 * Beam shape preset: describes only the "shape of the detection volume",
 * without key / position / direction. Use {@link withPreset} to expand it
 * into a complete SensorDef.
 */
export interface BeamPreset {
  /** Horizontal half-angle (degrees) */
  beamAngleHDeg: number
  /** Vertical half-angle (degrees) */
  beamAngleVDeg: number
  /** Minimum range (mm) */
  minRangeMm: number
  /** Maximum range (mm) */
  maxRangeMm: number
}

/**
 * Typical ultrasonic range-sensor preset.
 * Wide horizontally (45°), narrow vertically (20°), range 0.25–1.0m — matching the
 * defaults of this project's robots (e.g. YHS).
 *
 * The library itself is sensor-type agnostic; this preset only provides convenient
 * defaults for a common case. For mmWave radar / IR / ToF etc., define your own BeamPreset.
 */
export const ULTRASONIC_PRESET: BeamPreset = {
  beamAngleHDeg: 45,
  beamAngleVDeg: 20,
  minRangeMm: 250,
  maxRangeMm: 1000,
}

/**
 * Complete a sensor definition from a beam-shape preset.
 * The caller only needs to provide key / position / direction; the shape parameters
 * come from the preset. Any field can be overridden via `overrides`
 * (e.g. bump the range of one specific sensor).
 *
 * @example
 * const defs = sensors.map(s => withPreset(ULTRASONIC_PRESET, s))
 */
export function withPreset(
  preset: BeamPreset,
  sensor: Pick<SensorDef, 'key' | 'position' | 'direction'> & Partial<SensorDef>,
): SensorDef {
  return { ...preset, ...sensor }
}
