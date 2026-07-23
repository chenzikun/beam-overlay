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
 * Build an orthonormal basis { forward, right, up } for a given direction vector.
 * When dir is close to the world Y axis, it uses the X axis as the helper to avoid degeneracy.
 */
export function buildOrthoBase(dir: Vector3): {
  forward: Vector3
  right:   Vector3
  up:      Vector3
} {
  const forward = normalize(dir)
  // If forward is close to ±Y, use the X axis to avoid a degenerate cross product
  const helper: Vector3 = Math.abs(forward.y) > 0.99
    ? { x: 1, y: 0, z: 0 }
    : { x: 0, y: 1, z: 0 }
  const right = normalize(cross(forward, helper))
  const up    = cross(right, forward)
  return { forward, right, up }
}

/**
 * Test whether `point` lies inside a single beam's "ice-cream" solid:
 *   { inside the elliptic cone } ∩ { within distance `range` of the apex (spherical cap) }
 *
 * Two geometry notes (both were bugs in an earlier implementation, now fixed):
 * 1. The cone test must use the **ellipse** equation, not an axis-aligned box:
 *      (dH / (proj*tanH))^2 + (dV / (proj*tanV))^2 <= 1
 *    The box test (dH <= proj*tanH && dV <= proj*tanV) describes a rectangular pyramid,
 *    which is larger than the true elliptic cone and bulges at the diagonals, so it
 *    would not line up with the spherical cap boundary.
 * 2. The far end is capped by a **sphere** (spherical cap): the bound is |v| <= range,
 *    not the axial slice proj <= range.
 *
 * Kept in 1:1 logical correspondence with insideOtherCone() in beam.frag.glsl.
 */
export function pointInEllipticCone(
  point:   Vector3,
  apex:    Vector3,
  dir:     Vector3,   // caller must ensure this is normalized
  tanH:    number,    // tan(horizontal half-angle)
  tanV:    number,    // tan(vertical half-angle)
  range:   number,    // detection distance (spherical-cap radius), same unit as coordinates
): boolean {
  const v: Vector3 = { x: point.x - apex.x, y: point.y - apex.y, z: point.z - apex.z }
  const proj = dot(v, dir)                          // depth along the axis
  if (proj <= 0) return false                       // behind the sensor

  const dist2 = v.x * v.x + v.y * v.y + v.z * v.z
  if (dist2 > range * range) return false           // beyond the spherical cap

  const { right, up } = buildOrthoBase(dir)
  const eH = Math.abs(dot(v, right)) / (proj * tanH)  // normalized horizontal ellipse coordinate
  const eV = Math.abs(dot(v, up))    / (proj * tanV)  // normalized vertical ellipse coordinate

  return eH * eH + eV * eV <= 1                      // elliptic cross-section test
}
