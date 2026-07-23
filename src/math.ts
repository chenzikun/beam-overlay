import type { Vector3 } from './types'

export function normalize(v: Vector3): Vector3 {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
  if (len === 0) return { x: 0, y: 0, z: 0 }
  return { x: v.x / len, y: v.y / len, z: v.z / len }
}

export function dot(a: Vector3, b: Vector3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

export function cross(a: Vector3, b: Vector3): Vector3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

/**
 * 为给定方向向量构建正交基 { forward, right, up }。
 * 当 dir 接近世界 Y 轴时自动换用 X 轴作为辅助轴，防止退化。
 */
export function buildOrthoBase(dir: Vector3): {
  forward: Vector3
  right:   Vector3
  up:      Vector3
} {
  const forward = normalize(dir)
  // 若 forward 接近 ±Y，换用 X 轴避免 cross 退化
  const helper: Vector3 = Math.abs(forward.y) > 0.99
    ? { x: 1, y: 0, z: 0 }
    : { x: 0, y: 1, z: 0 }
  const right = normalize(cross(forward, helper))
  const up    = cross(right, forward)
  return { forward, right, up }
}

/**
 * 判断空间点 point 是否落在单个超声波波束的"冰淇淋"实体内：
 *   { 椭圆锥内 } ∩ { 到 apex 距离 ≤ range 的球（球缺封口）}
 *
 * 关键几何要点（此前的实现有两处数学错误，已修正）：
 * 1. 椭圆锥判定必须用**椭圆**方程，而非矩形盒子：
 *      (dH / (proj·tanH))² + (dV / (proj·tanV))² ≤ 1
 *    盒子判定 (dH ≤ proj·tanH 且 dV ≤ proj·tanV) 描述的是矩形金字塔，
 *    比真实椭圆锥大，会导致对角处凸出、与球缺边界对不上。
 * 2. 波束末端由**球面**（球缺）封口，边界是 |v| ≤ range，
 *    而非轴向切片 proj ≤ range。
 *
 * 与 beam.frag.glsl 中的 insideOtherCone() 保持 1:1 逻辑对应。
 */
export function pointInEllipticCone(
  point:   Vector3,
  apex:    Vector3,
  dir:     Vector3,   // 调用方须保证已归一化
  tanH:    number,    // tan(水平半角)
  tanV:    number,    // tan(垂直半角)
  range:   number,    // 探测距离（球缺半径），与坐标同单位
): boolean {
  const v: Vector3 = { x: point.x - apex.x, y: point.y - apex.y, z: point.z - apex.z }
  const proj = dot(v, dir)                          // 沿轴深度
  if (proj <= 0) return false                       // 在传感器背后

  const dist2 = v.x * v.x + v.y * v.y + v.z * v.z
  if (dist2 > range * range) return false           // 超出球缺（球面封口）

  const { right, up } = buildOrthoBase(dir)
  const eH = Math.abs(dot(v, right)) / (proj * tanH)  // 水平椭圆归一化坐标
  const eV = Math.abs(dot(v, up))    / (proj * tanV)  // 垂直椭圆归一化坐标

  return eH * eH + eV * eV <= 1                      // 椭圆截面判定
}
