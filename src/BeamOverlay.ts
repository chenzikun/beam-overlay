import * as THREE from 'three'
import type { SensorDef, Readings, FrameData } from './types'
import { MAX_SENSORS } from './types'
import { SensorBeam } from './SensorBeam'

/**
 * 方向性距离传感器探测体的 3D 叠加可视化。
 *
 * 每个传感器渲染为「椭圆锥 + 球缺」实体（探测波束），多个波束重叠时
 * 通过 GLSL 逐片元裁切剔除内部表面，只保留并集外壳，从而高亮危险区。
 *
 * 与具体传感器类型无关：超声波、毫米波雷达、红外测距、ToF 等均可使用。
 * 常见传感器的波束形状预设见 {@link ./presets}（如 ULTRASONIC_PRESET）。
 */
export class BeamOverlay {
  readonly group: THREE.Group

  private readonly _beams: SensorBeam[]
  private _t = 0
  private _lastFrame: FrameData

  /**
   * @param sensors   传感器描述列表（position / maxRangeMm 均为 mm）
   * @param options.mmPerUnit  场景换算系数：1 scene unit = mmPerUnit mm。
   *                           默认 1（mm == scene unit，适合直接用 mm 建模的场景）。
   *                           若场景 1 unit = 10mm，则传 { mmPerUnit: 10 }。
   */
  constructor(sensors: SensorDef[], options?: { mmPerUnit?: number }) {
    if (sensors.length > MAX_SENSORS) {
      console.warn(`[beam-overlay] 传感器数量 ${sensors.length} 超过 MAX_SENSORS=${MAX_SENSORS}，超出部分将被忽略`)
    }

    const mmPerUnit = options?.mmPerUnit ?? 1
    this._beams = sensors.slice(0, MAX_SENSORS).map(def => new SensorBeam(def, mmPerUnit))
    this.group  = new THREE.Group()
    this._beams.forEach(b => this.group.add(b.group))

    // 初始帧（无读数）
    this._lastFrame = {
      beams: this._beams.map(b => b.applyReading(null, 0)),
    }
    this._syncOtherUniforms()
  }

  /**
   * 传入最新测距数据，更新所有波束的几何缩放、颜色和裁切 uniforms。
   * 在宿主 requestAnimationFrame 循环内每帧调用。
   */
  update(readings: Readings): void {
    const beamStates = this._beams.map(beam =>
      beam.applyReading(readings[beam.key] ?? null, this._t),
    )
    this._syncOtherUniforms()
    this._lastFrame = { beams: beamStates }
  }

  /**
   * 驱动脉动/扫描等时间相关动画。
   * 在宿主动画循环内每帧调用，dt 单位：秒。
   */
  tick(dt: number): void {
    this._t += Math.min(dt, 0.05)  // 防止 tab 切换后时间跳变
  }

  /** 返回上一次 update() 的计算结果 */
  getFrameData(): FrameData {
    return this._lastFrame
  }

  /** 释放所有 GPU 资源（场景销毁时调用） */
  dispose(): void {
    this._beams.forEach(b => b.dispose())
  }

  /** 将所有其他传感器的参数同步到每个 beam 的 shader uniforms */
  private _syncOtherUniforms(): void {
    for (let i = 0; i < this._beams.length; i++) {
      const others = this._beams.filter((_, j) => j !== i)
      this._beams[i].setOtherSensors(others)
    }
  }
}
