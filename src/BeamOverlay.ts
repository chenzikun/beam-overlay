import * as THREE from 'three'
import type { SensorDef, Readings, FrameData } from './types'
import { MAX_SENSORS } from './types'
import { SensorBeam } from './SensorBeam'

/**
 * 3D overlay visualization of directional range-sensor detection volumes.
 *
 * Each sensor is rendered as an "elliptic cone + spherical cap" solid (its detection beam).
 * When multiple beams overlap, a GLSL per-fragment cull removes the inner surfaces so that
 * only the outer shell of the union remains, highlighting the danger zone.
 *
 * Sensor-type agnostic: ultrasonic, mmWave radar, IR range finders, ToF, etc. all work.
 * See {@link ./presets} for common beam-shape presets (e.g. ULTRASONIC_PRESET).
 */
export class BeamOverlay {
  readonly group: THREE.Group

  private readonly _beams: SensorBeam[]
  private _t = 0
  private _lastFrame: FrameData

  /**
   * @param sensors   List of sensor descriptions (position / maxRangeMm are in mm)
   * @param options.mmPerUnit  Scene scale factor: 1 scene unit = mmPerUnit mm.
   *                           Default 1 (mm == scene unit, for scenes modeled directly in mm).
   *                           If your scene has 1 unit = 10mm, pass { mmPerUnit: 10 }.
   */
  constructor(sensors: SensorDef[], options?: { mmPerUnit?: number }) {
    if (sensors.length > MAX_SENSORS) {
      console.warn(`[beam-overlay] sensor count ${sensors.length} exceeds MAX_SENSORS=${MAX_SENSORS}; extras will be ignored`)
    }

    const mmPerUnit = options?.mmPerUnit ?? 1
    this._beams = sensors.slice(0, MAX_SENSORS).map(def => new SensorBeam(def, mmPerUnit))
    this.group  = new THREE.Group()
    this._beams.forEach(b => this.group.add(b.group))

    // Initial frame (no readings)
    this._lastFrame = {
      beams: this._beams.map(b => b.applyReading(null, 0)),
    }
    this._syncOtherUniforms()
  }

  /**
   * Feed the latest range data to update every beam's geometry scale, color and clip uniforms.
   * Call every frame inside the host requestAnimationFrame loop.
   */
  update(readings: Readings): void {
    const beamStates = this._beams.map(beam =>
      beam.applyReading(readings[beam.key] ?? null, this._t),
    )
    this._syncOtherUniforms()
    this._lastFrame = { beams: beamStates }
  }

  /**
   * Drive time-based animations (pulsing, sweeping, etc.).
   * Call every frame inside the host animation loop. dt is in seconds.
   */
  tick(dt: number): void {
    this._t += Math.min(dt, 0.05)  // clamp to avoid time jumps after a tab switch
  }

  /** Returns the computed result of the last update() call */
  getFrameData(): FrameData {
    return this._lastFrame
  }

  /** Release all GPU resources (call when the scene is destroyed) */
  dispose(): void {
    this._beams.forEach(b => b.dispose())
  }

  /** Sync every other sensor's parameters into each beam's shader uniforms */
  private _syncOtherUniforms(): void {
    for (let i = 0; i < this._beams.length; i++) {
      const others = this._beams.filter((_, j) => j !== i)
      this._beams[i].setOtherSensors(others)
    }
  }
}
