import { describe, it, expect } from 'vitest'
import { normalize, dot, cross, buildOrthoBase, pointInEllipticCone } from '../src/math'

describe('normalize', () => {
  it('归一化非零向量', () => {
    const r = normalize({ x: 3, y: 0, z: 4 })
    expect(r.x).toBeCloseTo(0.6)
    expect(r.y).toBeCloseTo(0)
    expect(r.z).toBeCloseTo(0.8)
  })
  it('零向量返回零向量', () => {
    const r = normalize({ x: 0, y: 0, z: 0 })
    expect(r.x).toBe(0); expect(r.y).toBe(0); expect(r.z).toBe(0)
  })
})

describe('dot', () => {
  it('正交向量点积为 0', () => {
    expect(dot({ x:1,y:0,z:0 }, { x:0,y:1,z:0 })).toBe(0)
  })
  it('平行向量点积等于长度积', () => {
    expect(dot({ x:2,y:0,z:0 }, { x:3,y:0,z:0 })).toBe(6)
  })
})

describe('cross', () => {
  it('X cross Y = Z', () => {
    const r = cross({ x:1,y:0,z:0 }, { x:0,y:1,z:0 })
    expect(r.x).toBeCloseTo(0); expect(r.y).toBeCloseTo(0); expect(r.z).toBeCloseTo(1)
  })
})

describe('buildOrthoBase', () => {
  it('forward/right/up 两两正交', () => {
    const { forward, right, up } = buildOrthoBase({ x:0, y:0, z:-1 })
    expect(dot(forward, right)).toBeCloseTo(0)
    expect(dot(forward, up)).toBeCloseTo(0)
    expect(dot(right, up)).toBeCloseTo(0)
  })
  it('forward 与输入方向相同（归一化后）', () => {
    const dir = { x:1, y:0, z:0 }
    const { forward } = buildOrthoBase(dir)
    expect(forward.x).toBeCloseTo(1); expect(forward.y).toBeCloseTo(0); expect(forward.z).toBeCloseTo(0)
  })
  it('处理竖直向上方向（dir ≈ Y 轴时不退化）', () => {
    const { forward, right, up } = buildOrthoBase({ x:0, y:1, z:0 })
    expect(dot(forward, right)).toBeCloseTo(0)
    expect(dot(right, up)).toBeCloseTo(0)
  })
})

describe('pointInEllipticCone', () => {
  // 传感器朝 -Z 方向，位于原点，水平半角 45°(tanH=1)，垂直半角 26.57°(tanV=0.5)，量程 1000mm
  const apex = { x:0, y:0, z:0 }
  const dir  = normalize({ x:0, y:0, z:-1 })
  const tanH = 1.0   // tan(45°)
  const tanV = 0.5   // tan(26.57°)
  const range = 1000

  it('锥轴上的点（正前方中心）→ 在锥内', () => {
    expect(pointInEllipticCone({ x:0,y:0,z:-500 }, apex, dir, tanH, tanV, range)).toBe(true)
  })
  it('超出量程的点 → 不在锥内', () => {
    expect(pointInEllipticCone({ x:0,y:0,z:-1500 }, apex, dir, tanH, tanV, range)).toBe(false)
  })
  it('背后的点（z > 0）→ 不在锥内', () => {
    expect(pointInEllipticCone({ x:0,y:0,z:100 }, apex, dir, tanH, tanV, range)).toBe(false)
  })
  it('水平边界内（x = depth * tanH * 0.9）→ 在锥内', () => {
    const depth = 500
    expect(pointInEllipticCone({ x: depth * tanH * 0.9, y:0, z:-depth }, apex, dir, tanH, tanV, range)).toBe(true)
  })
  it('水平边界外（x = depth * tanH * 1.1）→ 不在锥内', () => {
    const depth = 500
    expect(pointInEllipticCone({ x: depth * tanH * 1.1, y:0, z:-depth }, apex, dir, tanH, tanV, range)).toBe(false)
  })
  it('垂直边界内（y = depth * tanV * 0.9）→ 在锥内', () => {
    const depth = 500
    expect(pointInEllipticCone({ x:0, y: depth * tanV * 0.9, z:-depth }, apex, dir, tanH, tanV, range)).toBe(true)
  })
  it('垂直边界外（y = depth * tanV * 1.1）→ 不在锥内', () => {
    const depth = 500
    expect(pointInEllipticCone({ x:0, y: depth * tanV * 1.1, z:-depth }, apex, dir, tanH, tanV, range)).toBe(false)
  })

  // ── 关键：椭圆锥 ≠ 矩形金字塔（对角处）
  // 盒子判定会把此点当作"在锥内"（dH、dV 各自 ≤ 边界），
  // 但椭圆判定 0.8²+0.8²=1.28 > 1，应在锥外。
  it('对角处（dH、dV 各 0.8 倍边界）→ 椭圆锥外（区分盒子）', () => {
    const depth = 500
    expect(pointInEllipticCone(
      { x: depth * tanH * 0.8, y: depth * tanV * 0.8, z: -depth },
      apex, dir, tanH, tanV, range,
    )).toBe(false)
  })
  it('对角处（dH、dV 各 0.6 倍边界）→ 椭圆锥内（0.72 < 1）', () => {
    const depth = 500
    expect(pointInEllipticCone(
      { x: depth * tanH * 0.6, y: depth * tanV * 0.6, z: -depth },
      apex, dir, tanH, tanV, range,
    )).toBe(true)
  })

  // ── 关键：末端由球面封口，而非轴向切片
  // 该点轴向深度 proj=900 < range=1000（轴向切片会误判在内），
  // 但离 apex 距离 = √(900²+400²)=985 < 1000，椭圆 (400/900)²≈0.198<1，应在内。
  it('球缺内斜向点（dist<range）→ 在锥内', () => {
    expect(pointInEllipticCone({ x: 400, y: 0, z: -900 }, apex, dir, tanH, tanV, range)).toBe(true)
  })
  // 轴向深度 proj=950<1000，但斜向使 dist=√(950²+450²)=1051 > range → 被球面截断，应在外。
  it('轴向未超程但越过球面（dist>range）→ 不在锥内', () => {
    expect(pointInEllipticCone({ x: 450, y: 0, z: -950 }, apex, dir, tanH, tanV, range)).toBe(false)
  })
})
