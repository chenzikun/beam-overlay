import * as THREE from 'three'
import type { SensorDef, Vector3, BeamState } from './types'
import { MAX_SENSORS } from './types'
import { normalize } from './math'
import beamVertSrc from './shaders/beam.vert.glsl'
import beamFragSrc from './shaders/beam.frag.glsl'

/** Renders a single sensor's 3D beam (library-internal, not exported). */
export class SensorBeam {
  readonly key: string
  readonly group: THREE.Group

  private readonly _def: SensorDef
  private readonly _dir: Vector3 // normalized direction
  private readonly _tanH: number
  private readonly _tanV: number
  /** Minimum range (mm, raw value) */
  private readonly _minRangeMm: number
  /** Maximum range (mm, raw value) */
  private readonly _maxRangeMm: number
  /** scene unit = 1 mm / mmPerUnit (e.g. if 1 scene unit = 10mm, mmPerUnit = 10) */
  private readonly _mmPerUnit: number
  /** Sensor position in scene coordinates (scene units) */
  private readonly _scenePos: Vector3

  // Three.js objects
  private readonly _coneGroup: THREE.Group // cone (scaled to effective range)
  private readonly _capGroup: THREE.Group // spherical cap (shown when obstacle present)
  private readonly _dotMesh: THREE.Mesh // sensor indicator dot
  private readonly _coneMat: THREE.ShaderMaterial
  private readonly _capMat: THREE.ShaderMaterial

  // Animation state
  private _lastState: BeamState

  /**
   * @param def       Static sensor description (position / maxRangeMm are in mm)
   * @param mmPerUnit Scene unit scale factor: 1 scene unit = mmPerUnit mm.
   *                  Default 1 (mm == scene unit).
   *                  The YHS demo uses 1 unit = 10mm, so it passes 10.
   */
  constructor(def: SensorDef, mmPerUnit = 1) {
    this.key       = def.key
    this._def      = def
    this._mmPerUnit = mmPerUnit
    this._dir      = normalize(def.direction)
    this._tanH     = Math.tan((def.beamAngleHDeg * Math.PI) / 180)
    this._tanV     = Math.tan((def.beamAngleVDeg * Math.PI) / 180)
    this._minRangeMm = def.minRangeMm ?? 200
    this._maxRangeMm = def.maxRangeMm

    // Convert position to scene units
    const inv = 1 / mmPerUnit
    this._scenePos = {
      x: def.position.x * inv,
      y: def.position.y * inv,
      z: def.position.z * inv,
    }

    // -- Cone geometry (apex at origin, opening along +Y; at depth=1 the base radius = 1)
    // Scaling x=s*tanH, y=s, z=s*tanV turns it into an elliptic cone.
    const coneGeo = new THREE.CylinderGeometry(1, 0, 1, 32, 1, true)
    coneGeo.translate(0, 0.5, 0) // move apex to origin, base at y=1

    // -- Spherical cap geometry (radius=1, cap toward the apex axis; thetaLength = horizontal half-angle)
    const capGeo = new THREE.SphereGeometry(
      1,
      32,
      16,
      0,
      Math.PI * 2,
      0,
      (def.beamAngleHDeg * Math.PI) / 180,
    )

    // -- Own sensor base parameters (scene coordinates, scene units)
    const ownApex = new THREE.Vector3(
      def.position.x / mmPerUnit,
      def.position.y / mmPerUnit,
      def.position.z / mmPerUnit,
    )
    const ownDir  = new THREE.Vector3(this._dir.x, this._dir.y, this._dir.z)

    // -- ShaderMaterial (cone + cap share the uniforms structure, but each has its own instance)
    // selfConeClip: 0 = cone (sphere clip)  1 = cap (+ elliptic cone-angle clip)
    const makeUniforms = (selfConeClip: 0 | 1) => ({
      // Occlusion parameters of other sensors
      uOtherApex:  { value: Array(MAX_SENSORS).fill(null).map(() => new THREE.Vector3()) },
      uOtherDir:   { value: Array(MAX_SENSORS).fill(null).map(() => new THREE.Vector3()) },
      uOtherTanH:  { value: new Float32Array(MAX_SENSORS) },
      uOtherTanV:  { value: new Float32Array(MAX_SENSORS) },
      uOtherRange: { value: new Float32Array(MAX_SENSORS) },
      uOtherCount: { value: 0 },
      // Own sensor parameters (own sphere clip + cap cone-angle clip)
      uOwnApex:      { value: ownApex.clone() },
      uOwnDir:       { value: ownDir.clone() },
      uOwnTanH:      { value: this._tanH },
      uOwnTanV:      { value: this._tanV },
      uOwnRange:     { value: 0 },            // updated per frame in applyReading
      uSelfConeClip: { value: selfConeClip },
      // Render parameters
      uColor:   { value: new THREE.Color(0x29aaff) },
      uOpacity: { value: 0.2 },
    })

    const matParams = {
      vertexShader: beamVertSrc,
      fragmentShader: beamFragSrc,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,   // both cone/cap use double-side: front = outer surface (always visible), back = inner surface (culled on overlap)
      blending: THREE.NormalBlending,
    }

    this._coneMat = new THREE.ShaderMaterial({ ...matParams, uniforms: makeUniforms(0) })
    this._capMat = new THREE.ShaderMaterial({
      ...matParams,
      uniforms: makeUniforms(1),
    })

    // -- Group hierarchy
    this._coneGroup = new THREE.Group()
    this._coneGroup.add(new THREE.Mesh(coneGeo, this._coneMat))

    this._capGroup = new THREE.Group()
    this._capGroup.add(new THREE.Mesh(capGeo, this._capMat))
    this._capGroup.visible = false

    // -- Sensor indicator dot (fixed small sphere, not affected by shader clipping)
    const dotGeo = new THREE.SphereGeometry(2.2, 8, 6)
    const dotMat = new THREE.MeshStandardMaterial({
      color: 0x4fc3f7,
      emissive: new THREE.Color(0x4fc3f7),
      emissiveIntensity: 0.18,
    })
    this._dotMesh = new THREE.Mesh(dotGeo, dotMat)

    // -- Rotate coneGroup to align with the sensor direction.
    // Three.js CylinderGeometry points along +Y, so rotate it to `dir`.
    const yAxis = new THREE.Vector3(0, 1, 0)
    const dirV3 = new THREE.Vector3(this._dir.x, this._dir.y, this._dir.z)
    const quat = new THREE.Quaternion().setFromUnitVectors(yAxis, dirV3)

    // All Three.js object positions use scene units
    const sp = this._scenePos
    this._coneGroup.position.set(sp.x, sp.y, sp.z)
    this._coneGroup.quaternion.copy(quat)

    this._capGroup.position.set(sp.x, sp.y, sp.z)
    this._capGroup.quaternion.copy(quat)

    this._dotMesh.position.set(sp.x, sp.y, sp.z)

    // -- Parent Group (added to the host scene)
    this.group = new THREE.Group()
    this.group.add(this._coneGroup)
    this.group.add(this._capGroup)
    this.group.add(this._dotMesh)

    // -- Initial state
    this._lastState = {
      key: this.key,
      hasObstacle: false,
      effectiveRangeMm: this._maxRangeMm,
      proximityRatio: 1,
      obstaclePoint: null,
    }
  }

  /**
   * Update geometry scale and color uniforms from the latest range reading.
   * @param rangeMm Range reading (mm), null = no obstacle
   * @param t       Accumulated time (seconds), used for the pulsing animation
   * @returns The BeamState for the current frame
   */
  applyReading(rangeMm: number | null, t: number): BeamState {
    // All comparisons and interpolation happen in the mm domain to keep API semantics (mm) correct
    const hasObstacle = rangeMm !== null && rangeMm < this._maxRangeMm
    const distMm = hasObstacle
      ? Math.min(Math.max(rangeMm!, this._minRangeMm), this._maxRangeMm)
      : this._maxRangeMm

    const ratio = (distMm - this._minRangeMm) / (this._maxRangeMm - this._minRangeMm)
    const cr = ratio > 0.5 ? 1 - (ratio - 0.5) * 2 : 1
    const cg = ratio > 0.5 ? 1 : ratio * 2

    // Convert to scene units for geometry scaling (1 scene unit = mmPerUnit mm)
    const s = distMm / this._mmPerUnit

    if (hasObstacle) {
      // Scale the cone to the obstacle distance; color goes green -> yellow -> red
      this._coneGroup.scale.set(s * this._tanH, s, s * this._tanV)
      this._coneMat.uniforms.uOwnRange.value = s
      this._coneMat.uniforms.uColor.value.setRGB(cr, cg, 0)
      this._coneMat.uniforms.uOpacity.value = 0.22 + 0.13 * (1 - ratio)

      // Cap: uniform scale into a true sphere (radius = s); the shader clips it to the elliptic cone angle
      this._capGroup.scale.set(s, s, s)
      this._capMat.uniforms.uOwnRange.value = s
      this._capGroup.visible = true
      this._capMat.uniforms.uColor.value.setRGB(cr, cg, 0)
      const pulseHz = 1.5 + (1 - ratio) * 7
      this._capMat.uniforms.uOpacity.value = 0.5 + 0.35 * Math.abs(Math.sin(t * pulseHz))
    } else {
      // No obstacle: blue, expanded to max range (the limit), with a faint breathing animation
      this._coneGroup.scale.set(s * this._tanH, s, s * this._tanV)
      this._coneMat.uniforms.uOwnRange.value = s
      this._coneMat.uniforms.uColor.value.setRGB(0.16, 0.67, 1)
      this._coneMat.uniforms.uOpacity.value = 0.16 + 0.05 * Math.sin(t * 0.5)

      this._capGroup.visible = false
    }

    // Indicator dot pulsing
    const dotMat = this._dotMesh.material as THREE.MeshStandardMaterial
    dotMat.emissiveIntensity = 0.12 + 0.28 * Math.abs(Math.sin(t * 0.85))

    // Obstacle point coordinates (mm, same unit as SensorDef.position)
    const obstaclePoint = hasObstacle
      ? {
          x: this._def.position.x + this._dir.x * distMm,
          y: this._def.position.y + this._dir.y * distMm,
          z: this._def.position.z + this._dir.z * distMm,
        }
      : null

    this._lastState = {
      key: this.key,
      hasObstacle,
      effectiveRangeMm: distMm,   // real mm, consistent with the API semantics
      proximityRatio: ratio,
      obstaclePoint,
    }
    return this._lastState
  }

  /**
   * Write the current parameters of the other sensors into this beam's shader uniforms.
   * Call every frame after applyReading.
   */
  setOtherSensors(others: SensorBeam[]): void {
    const count = Math.min(others.length, MAX_SENSORS)

    for (const mat of [this._coneMat, this._capMat]) {
      const u = mat.uniforms
      for (let i = 0; i < count; i++) {
        const o = others[i]
        // The shader clips in world (scene) space, so values must be in scene units
        const p = o._scenePos
        const d = o._dir
        u.uOtherApex.value[i].set(p.x, p.y, p.z)
        u.uOtherDir.value[i].set(d.x, d.y, d.z)
        ;(u.uOtherTanH.value as Float32Array)[i] = o._tanH
        ;(u.uOtherTanV.value as Float32Array)[i] = o._tanV
        // effectiveRangeMm is real mm; convert to scene units before passing to the shader
        ;(u.uOtherRange.value as Float32Array)[i] = o._lastState.effectiveRangeMm / o._mmPerUnit
      }
      u.uOtherCount.value = count
    }
  }

  dispose(): void {
    this._coneGroup.children.forEach((c) => (c as THREE.Mesh).geometry.dispose())
    this._capGroup.children.forEach((c) => (c as THREE.Mesh).geometry.dispose())
    this._dotMesh.geometry.dispose()
    this._coneMat.dispose()
    this._capMat.dispose()
    ;(this._dotMesh.material as THREE.Material).dispose()
  }
}
