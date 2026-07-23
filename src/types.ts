/** 三维向量（不依赖 Three.js） */
export interface Vector3 {
  x: number
  y: number
  z: number
}

/**
 * 多波束裁切支持的最大「其他传感器」数量。
 * 须与 `shaders/beam.frag.glsl` 中的 `#define MAX_SENSORS` 保持一致。
 */
export const MAX_SENSORS = 8 as const

/**
 * 单个传感器的静态描述。
 * 初始化时传入 BeamOverlay，之后不可变。
 */
export interface SensorDef {
  /** 唯一标识，与 Readings 的 key 对应 */
  key: string
  /** 传感器世界坐标（mm） */
  position: Vector3
  /**
   * 探测朝向（构造函数内自动归一化，调用方无需预处理）。
   * Y 轴朝上的右手坐标系，与 Three.js 默认一致。
   */
  direction: Vector3
  /** 水平半角（度），典型值 45 */
  beamAngleHDeg: number
  /** 垂直半角（度），典型值 20 */
  beamAngleVDeg: number
  /** 最大量程（mm），典型值 2450 */
  maxRangeMm: number
  /** 最小量程（mm），默认 200 */
  minRangeMm?: number
}

/**
 * 每帧传入的测距数据。
 * key 与 SensorDef.key 对应。
 * null  = 无障碍物 / 超出量程 / 无信号
 * number = 障碍物距离（mm，正数）
 */
export type Readings = Record<string, number | null>

/** 单个波束当前帧的计算结果 */
export interface BeamState {
  key: string
  /** 是否命中障碍物 */
  hasObstacle: boolean
  /**
   * 当前有效探测距离（mm）。
   * hasObstacle=false 时等于 maxRangeMm。
   */
  effectiveRangeMm: number
  /**
   * 接近度比值 [0, 1]。
   * 0 = 极近（危险，颜色映射为红），1 = 最远（安全，映射为绿）。
   * hasObstacle=false 时为 1。
   */
  proximityRatio: number
  /**
   * 障碍物点世界坐标（mm）。
   * = position + normalize(direction) * effectiveRangeMm
   * hasObstacle=false 时为 null。
   */
  obstaclePoint: Vector3 | null
}

/** update() 后可通过 getFrameData() 获取的当前帧计算结果 */
export interface FrameData {
  beams: BeamState[]
}
