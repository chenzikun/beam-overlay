import type { SensorDef } from './types'

/**
 * 波束形状预设：只描述「探测体的形状」，不含 key / position / direction。
 * 用 {@link withPreset} 展开成完整 SensorDef。
 */
export interface BeamPreset {
  /** 水平半角（度） */
  beamAngleHDeg: number
  /** 垂直半角（度） */
  beamAngleVDeg: number
  /** 最小量程（mm） */
  minRangeMm: number
  /** 最大量程（mm） */
  maxRangeMm: number
}

/**
 * 典型超声波测距传感器预设。
 * 水平较宽(45°)、垂直较窄(20°)，量程 0.25–1.0m —— 与本项目机型（YHS 等）默认一致。
 *
 * 本库本身与传感器类型无关，此预设仅为常见场景提供便捷默认值。
 * 需要毫米波雷达/红外/ToF 等其他形状时，自行定义 BeamPreset 即可。
 */
export const ULTRASONIC_PRESET: BeamPreset = {
  beamAngleHDeg: 45,
  beamAngleVDeg: 20,
  minRangeMm: 250,
  maxRangeMm: 1000,
}

/**
 * 用波束形状预设补全传感器定义。
 * 调用方只需给出 key / position / direction，形状参数由 preset 提供；
 * 任意字段都可通过 overrides 覆盖（如单独调大某个传感器的量程）。
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
