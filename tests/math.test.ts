import { describe, it, expect } from 'vitest'
import { normalize, dot, cross, buildOrthoBase, pointInEllipticCone } from '../src/math'

describe('normalize', () => {
  it('normalizes a non-zero vector', () => {
    const r = normalize({ x: 3, y: 0, z: 4 })
    expect(r.x).toBeCloseTo(0.6)
    expect(r.y).toBeCloseTo(0)
    expect(r.z).toBeCloseTo(0.8)
  })
  it('returns a zero vector for a zero vector', () => {
    const r = normalize({ x: 0, y: 0, z: 0 })
    expect(r.x).toBe(0); expect(r.y).toBe(0); expect(r.z).toBe(0)
  })
})

describe('dot', () => {
  it('dot product of orthogonal vectors is 0', () => {
    expect(dot({ x:1,y:0,z:0 }, { x:0,y:1,z:0 })).toBe(0)
  })
  it('dot product of parallel vectors equals the product of lengths', () => {
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
  it('forward/right/up are mutually orthogonal', () => {
    const { forward, right, up } = buildOrthoBase({ x:0, y:0, z:-1 })
    expect(dot(forward, right)).toBeCloseTo(0)
    expect(dot(forward, up)).toBeCloseTo(0)
    expect(dot(right, up)).toBeCloseTo(0)
  })
  it('forward equals the input direction (after normalization)', () => {
    const dir = { x:1, y:0, z:0 }
    const { forward } = buildOrthoBase(dir)
    expect(forward.x).toBeCloseTo(1); expect(forward.y).toBeCloseTo(0); expect(forward.z).toBeCloseTo(0)
  })
  it('handles the straight-up direction (no degeneracy when dir ≈ Y axis)', () => {
    const { forward, right, up } = buildOrthoBase({ x:0, y:1, z:0 })
    expect(dot(forward, right)).toBeCloseTo(0)
    expect(dot(right, up)).toBeCloseTo(0)
  })
})

describe('pointInEllipticCone', () => {
  // Sensor faces -Z at the origin, horizontal half-angle 45° (tanH=1),
  // vertical half-angle 26.57° (tanV=0.5), range 1000mm
  const apex = { x:0, y:0, z:0 }
  const dir  = normalize({ x:0, y:0, z:-1 })
  const tanH = 1.0   // tan(45°)
  const tanV = 0.5   // tan(26.57°)
  const range = 1000

  it('point on the cone axis (straight ahead, centered) -> inside', () => {
    expect(pointInEllipticCone({ x:0,y:0,z:-500 }, apex, dir, tanH, tanV, range)).toBe(true)
  })
  it('point beyond the range -> outside', () => {
    expect(pointInEllipticCone({ x:0,y:0,z:-1500 }, apex, dir, tanH, tanV, range)).toBe(false)
  })
  it('point behind the sensor (z > 0) -> outside', () => {
    expect(pointInEllipticCone({ x:0,y:0,z:100 }, apex, dir, tanH, tanV, range)).toBe(false)
  })
  it('within the horizontal bound (x = depth * tanH * 0.9) -> inside', () => {
    const depth = 500
    expect(pointInEllipticCone({ x: depth * tanH * 0.9, y:0, z:-depth }, apex, dir, tanH, tanV, range)).toBe(true)
  })
  it('outside the horizontal bound (x = depth * tanH * 1.1) -> outside', () => {
    const depth = 500
    expect(pointInEllipticCone({ x: depth * tanH * 1.1, y:0, z:-depth }, apex, dir, tanH, tanV, range)).toBe(false)
  })
  it('within the vertical bound (y = depth * tanV * 0.9) -> inside', () => {
    const depth = 500
    expect(pointInEllipticCone({ x:0, y: depth * tanV * 0.9, z:-depth }, apex, dir, tanH, tanV, range)).toBe(true)
  })
  it('outside the vertical bound (y = depth * tanV * 1.1) -> outside', () => {
    const depth = 500
    expect(pointInEllipticCone({ x:0, y: depth * tanV * 1.1, z:-depth }, apex, dir, tanH, tanV, range)).toBe(false)
  })

  // -- Key: an elliptic cone is NOT a rectangular pyramid (at the diagonals)
  // A box test would treat this point as "inside" (dH and dV each <= their bound),
  // but the ellipse test gives 0.8^2 + 0.8^2 = 1.28 > 1, so it must be outside.
  it('diagonal point (dH, dV each 0.8x the bound) -> outside the elliptic cone (distinguishes a box)', () => {
    const depth = 500
    expect(pointInEllipticCone(
      { x: depth * tanH * 0.8, y: depth * tanV * 0.8, z: -depth },
      apex, dir, tanH, tanV, range,
    )).toBe(false)
  })
  it('diagonal point (dH, dV each 0.6x the bound) -> inside the elliptic cone (0.72 < 1)', () => {
    const depth = 500
    expect(pointInEllipticCone(
      { x: depth * tanH * 0.6, y: depth * tanV * 0.6, z: -depth },
      apex, dir, tanH, tanV, range,
    )).toBe(true)
  })

  // -- Key: the far end is capped by a sphere, not by an axial slice
  // This point's axial depth proj=900 < range=1000 (an axial-slice test would wrongly accept it),
  // but its distance to the apex = sqrt(900^2+400^2)=985 < 1000 and the ellipse (400/900)^2≈0.198<1, so it is inside.
  it('diagonal point inside the spherical cap (dist<range) -> inside', () => {
    expect(pointInEllipticCone({ x: 400, y: 0, z: -900 }, apex, dir, tanH, tanV, range)).toBe(true)
  })
  // Axial depth proj=950<1000, but the diagonal pushes dist=sqrt(950^2+450^2)=1051 > range -> cut off by the sphere, so outside.
  it('axial depth within range but past the sphere (dist>range) -> outside', () => {
    expect(pointInEllipticCone({ x: 450, y: 0, z: -950 }, apex, dir, tanH, tanV, range)).toBe(false)
  })
})
