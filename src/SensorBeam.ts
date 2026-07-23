import * as THREE from 'three'
import type { SensorDef, Vector3, BeamState } from './types'
import { MAX_SENSORS } from './types'
import { normalize } from './math'
import beamVertSrc from './shaders/beam.vert.glsl'
import beamFragSrc from './shaders/beam.frag.glsl'

/** 单个传感器的三维波束渲染对象（库内部使用，不对外暴露）。 */
export class SensorBeam {
  readonly key: string
  readonly group: THREE.Group

  private readonly _def: SensorDef
  private readonly _dir: Vector3 // 归一化朝向
  private readonly _tanH: number
  private readonly _tanV: number
  /** 最小量程（mm，原始值） */
  private readonly _minRangeMm: number
  /** 最大量程（mm，原始值） */
  private readonly _maxRangeMm: number
  /** scene unit = 1 mm / mmPerUnit（如场景 1 unit=10mm，则 mmPerUnit=10） */
  private readonly _mmPerUnit: number
  /** 传感器在场景坐标系中的位置（scene units） */
  private readonly _scenePos: Vector3

  // Three.js 对象
  private readonly _coneGroup: THREE.Group // 锥体（缩放到有效距离）
  private readonly _capGroup: THREE.Group // 球缺（障碍物时显示）
  private readonly _dotMesh: THREE.Mesh // 传感器指示点
  private readonly _coneMat: THREE.ShaderMaterial
  private readonly _capMat: THREE.ShaderMaterial

  // 动画状态
  private _lastState: BeamState

  /**
   * @param def       传感器静态描述（position / maxRangeMm 均为 mm）
   * @param mmPerUnit 场景单位换算系数：1 scene unit = mmPerUnit mm。
   *                  默认 1（mm == scene unit）。
   *                  YHS demo 场景 1 unit=10mm，则传 10。
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

    // 位置换算到 scene units
    const inv = 1 / mmPerUnit
    this._scenePos = {
      x: def.position.x * inv,
      y: def.position.y * inv,
      z: def.position.z * inv,
    }

    // ── 锥体几何（顶点在原点，沿 +Y 展开，depth=1 时底面半径=1）
    // 缩放 x=s*tanH, y=s, z=s*tanV 得到椭圆锥
    const coneGeo = new THREE.CylinderGeometry(1, 0, 1, 32, 1, true)
    coneGeo.translate(0, 0.5, 0) // 顶点移到原点，底面在 y=1

    // ── 球缺几何（半径=1，锥顶方向的球帽，thetaLength=水平半角）
    const capGeo = new THREE.SphereGeometry(
      1,
      32,
      16,
      0,
      Math.PI * 2,
      0,
      (def.beamAngleHDeg * Math.PI) / 180,
    )

    // ── 自身传感器基础参数（场景坐标系，scene units）
    const ownApex = new THREE.Vector3(
      def.position.x / mmPerUnit,
      def.position.y / mmPerUnit,
      def.position.z / mmPerUnit,
    )
    const ownDir  = new THREE.Vector3(this._dir.x, this._dir.y, this._dir.z)

    // ── ShaderMaterial（锥体 + 球缺共享 uniforms 结构，各自独立实例）
    // selfConeClip: 0=锥体（球面裁切）  1=球缺（+椭圆锥角裁切）
    const makeUniforms = (selfConeClip: 0 | 1) => ({
      // 其他传感器遮挡参数
      uOtherApex:  { value: Array(MAX_SENSORS).fill(null).map(() => new THREE.Vector3()) },
      uOtherDir:   { value: Array(MAX_SENSORS).fill(null).map(() => new THREE.Vector3()) },
      uOtherTanH:  { value: new Float32Array(MAX_SENSORS) },
      uOtherTanV:  { value: new Float32Array(MAX_SENSORS) },
      uOtherRange: { value: new Float32Array(MAX_SENSORS) },
      uOtherCount: { value: 0 },
      // 自身传感器参数（自身球面裁切 + 球缺锥角裁切）
      uOwnApex:      { value: ownApex.clone() },
      uOwnDir:       { value: ownDir.clone() },
      uOwnTanH:      { value: this._tanH },
      uOwnTanV:      { value: this._tanV },
      uOwnRange:     { value: 0 },            // 每帧在 applyReading 中更新
      uSelfConeClip: { value: selfConeClip },
      // 渲染参数
      uColor:   { value: new THREE.Color(0x29aaff) },
      uOpacity: { value: 0.2 },
    })

    const matParams = {
      vertexShader: beamVertSrc,
      fragmentShader: beamFragSrc,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,   // 锥体/球缺均用双面：正面=外表面(始终可见)，背面=内表面(重叠时裁切)
      blending: THREE.NormalBlending,
    }

    this._coneMat = new THREE.ShaderMaterial({ ...matParams, uniforms: makeUniforms(0) })
    this._capMat = new THREE.ShaderMaterial({
      ...matParams,
      uniforms: makeUniforms(1),
    })

    // ── Group 层级
    this._coneGroup = new THREE.Group()
    this._coneGroup.add(new THREE.Mesh(coneGeo, this._coneMat))

    this._capGroup = new THREE.Group()
    this._capGroup.add(new THREE.Mesh(capGeo, this._capMat))
    this._capGroup.visible = false

    // ── 传感器指示点（固定小球，不参与 shader 裁切）
    const dotGeo = new THREE.SphereGeometry(2.2, 8, 6)
    const dotMat = new THREE.MeshStandardMaterial({
      color: 0x4fc3f7,
      emissive: new THREE.Color(0x4fc3f7),
      emissiveIntensity: 0.18,
    })
    this._dotMesh = new THREE.Mesh(dotGeo, dotMat)

    // ── coneGroup 旋转对齐传感器朝向
    // Three.js CylinderGeometry 沿 +Y，需旋转到 dir 方向
    const yAxis = new THREE.Vector3(0, 1, 0)
    const dirV3 = new THREE.Vector3(this._dir.x, this._dir.y, this._dir.z)
    const quat = new THREE.Quaternion().setFromUnitVectors(yAxis, dirV3)

    // 所有 Three.js 对象位置使用 scene units
    const sp = this._scenePos
    this._coneGroup.position.set(sp.x, sp.y, sp.z)
    this._coneGroup.quaternion.copy(quat)

    this._capGroup.position.set(sp.x, sp.y, sp.z)
    this._capGroup.quaternion.copy(quat)

    this._dotMesh.position.set(sp.x, sp.y, sp.z)

    // ── 父 Group（挂入宿主 scene）
    this.group = new THREE.Group()
    this.group.add(this._coneGroup)
    this.group.add(this._capGroup)
    this.group.add(this._dotMesh)

    // ── 初始状态
    this._lastState = {
      key: this.key,
      hasObstacle: false,
      effectiveRangeMm: this._maxRangeMm,
      proximityRatio: 1,
      obstaclePoint: null,
    }
  }

  /**
   * 根据最新测距值更新几何缩放和颜色 uniforms。
   * @param rangeMm 测距值（mm），null = 无障碍物
   * @param t       累计时间（秒），用于脉动动画
   * @returns 当前帧的 BeamState
   */
  applyReading(rangeMm: number | null, t: number): BeamState {
    // 所有比较和插值在 mm 域完成，保证 API 语义（mm）正确
    const hasObstacle = rangeMm !== null && rangeMm < this._maxRangeMm
    const distMm = hasObstacle
      ? Math.min(Math.max(rangeMm!, this._minRangeMm), this._maxRangeMm)
      : this._maxRangeMm

    const ratio = (distMm - this._minRangeMm) / (this._maxRangeMm - this._minRangeMm)
    const cr = ratio > 0.5 ? 1 - (ratio - 0.5) * 2 : 1
    const cg = ratio > 0.5 ? 1 : ratio * 2

    // 换算到 scene units 做几何缩放（1 scene unit = mmPerUnit mm）
    const s = distMm / this._mmPerUnit

    if (hasObstacle) {
      // 锥体缩放到障碍物距离，颜色绿→黄→红
      this._coneGroup.scale.set(s * this._tanH, s, s * this._tanV)
      this._coneMat.uniforms.uOwnRange.value = s
      this._coneMat.uniforms.uColor.value.setRGB(cr, cg, 0)
      this._coneMat.uniforms.uOpacity.value = 0.22 + 0.13 * (1 - ratio)

      // 球缺：均匀缩放为真球（半径=s），由 shader 裁切到椭圆锥角范围内
      this._capGroup.scale.set(s, s, s)
      this._capMat.uniforms.uOwnRange.value = s
      this._capGroup.visible = true
      this._capMat.uniforms.uColor.value.setRGB(cr, cg, 0)
      const pulseHz = 1.5 + (1 - ratio) * 7
      this._capMat.uniforms.uOpacity.value = 0.5 + 0.35 * Math.abs(Math.sin(t * pulseHz))
    } else {
      // 无障碍物：蓝色展开至最大量程（最大限位），微弱呼吸动画
      this._coneGroup.scale.set(s * this._tanH, s, s * this._tanV)
      this._coneMat.uniforms.uOwnRange.value = s
      this._coneMat.uniforms.uColor.value.setRGB(0.16, 0.67, 1)
      this._coneMat.uniforms.uOpacity.value = 0.16 + 0.05 * Math.sin(t * 0.5)

      this._capGroup.visible = false
    }

    // 指示点脉动
    const dotMat = this._dotMesh.material as THREE.MeshStandardMaterial
    dotMat.emissiveIntensity = 0.12 + 0.28 * Math.abs(Math.sin(t * 0.85))

    // 障碍物点坐标（mm，与 SensorDef.position 单位一致）
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
      effectiveRangeMm: distMm,   // 真实 mm，与 API 语义一致
      proximityRatio: ratio,
      obstaclePoint,
    }
    return this._lastState
  }

  /**
   * 将其他传感器的当前参数写入本 beam 的 shader uniforms。
   * 每帧在 applyReading 之后调用。
   */
  setOtherSensors(others: SensorBeam[]): void {
    const count = Math.min(others.length, MAX_SENSORS)

    for (const mat of [this._coneMat, this._capMat]) {
      const u = mat.uniforms
      for (let i = 0; i < count; i++) {
        const o = others[i]
        // shader 在 scene 坐标系中做世界空间裁切，必须使用 scene units
        const p = o._scenePos
        const d = o._dir
        u.uOtherApex.value[i].set(p.x, p.y, p.z)
        u.uOtherDir.value[i].set(d.x, d.y, d.z)
        ;(u.uOtherTanH.value as Float32Array)[i] = o._tanH
        ;(u.uOtherTanV.value as Float32Array)[i] = o._tanV
        // effectiveRangeMm 是真实 mm，换算为 scene units 传入 shader
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
