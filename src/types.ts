/** 3D vector (no Three.js dependency) */
export interface Vector3 {
  x: number
  y: number
  z: number
}

/**
 * Static description of a single sensor.
 * Passed to BeamOverlay at construction time; immutable afterward.
 */
export interface SensorDef {
  /** Unique identifier, matching a key in Readings */
  key: string
  /** Sensor world position (mm) */
  position: Vector3
  /**
   * Detection direction (normalized inside the constructor, no need to pre-normalize).
   * Right-handed, Y-up coordinate system, matching the Three.js default.
   */
  direction: Vector3
  /** Horizontal half-angle (degrees), typically 45 */
  beamAngleHDeg: number
  /** Vertical half-angle (degrees), typically 20 */
  beamAngleVDeg: number
  /** Maximum range (mm), typically 2450 */
  maxRangeMm: number
  /** Minimum range (mm), default 200 */
  minRangeMm?: number
}

/**
 * Range data fed in each frame.
 * Keys map to SensorDef.key.
 * null   = no obstacle / out of range / no signal
 * number = obstacle distance (mm, positive)
 */
export type Readings = Record<string, number | null>

/** Computed result for a single beam in the current frame */
export interface BeamState {
  key: string
  /** Whether an obstacle was hit */
  hasObstacle: boolean
  /**
   * Current effective detection distance (mm).
   * Equals maxRangeMm when hasObstacle is false.
   */
  effectiveRangeMm: number
  /**
   * Proximity ratio in [0, 1].
   * 0 = very close (dangerous, mapped to red), 1 = farthest (safe, mapped to green).
   * Equals 1 when hasObstacle is false.
   */
  proximityRatio: number
  /**
   * Obstacle point in world coordinates (mm).
   * = position + normalize(direction) * effectiveRangeMm
   * null when hasObstacle is false.
   */
  obstaclePoint: Vector3 | null
}

/** Current-frame computed result, available via getFrameData() after update() */
export interface FrameData {
  beams: BeamState[]
}
