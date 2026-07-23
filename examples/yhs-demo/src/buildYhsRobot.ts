import * as THREE from 'three'
import { ULTRASONIC_PRESET, withPreset } from 'beam-overlay'

// 1 unit = 10mm
const DIM = {
  bodyW: 51.5, bodyH: 44,   bodyD: 72.5,
  headW: 51.5, headH: 46,   headD: 18,
  chamfer: 8,
  wheelR: 15,  wheelT: 8,
  lidarR: 6,   lidarH: 10,
}
const CHASSIS_H = 25
const bodyTop     = DIM.bodyH
const headTop     = DIM.bodyH + DIM.headH
const headFrontZ  = -DIM.bodyD / 2
const headCenterZ = headFrontZ + DIM.headD / 2

const C = {
  body:    0xc6ccd4,
  head:    0xdde0e6,
  bodyBot: 0x8a9099,
  wheel:   0x111315,
  hub:     0x5a6070,
  lidarBs: 0x4a5060,
  accent:  0x58a6ff,
  lidar:   0xd2a8ff,
} as const

function mkMat(color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.65, ...extra })
}
function glowMat(color: number, intensity = 0.4) {
  return mkMat(color, { emissive: new THREE.Color(color), emissiveIntensity: intensity })
}

function buildHeadGeo(): THREE.ExtrudeGeometry {
  const hw  = DIM.headW / 2
  const ch  = DIM.chamfer
  const sYf = -headFrontZ
  const sYb = sYf - DIM.headD
  const shape = new THREE.Shape()
  shape.moveTo(-hw,      sYf - ch)
  shape.lineTo(-hw,      sYb)
  shape.lineTo( hw,      sYb)
  shape.lineTo( hw,      sYf - ch)
  shape.lineTo( hw - ch, sYf)
  shape.lineTo(-(hw-ch), sYf)
  shape.closePath()
  return new THREE.ExtrudeGeometry(shape, { depth: DIM.headH, bevelEnabled: false })
}

/**
 * Build the procedural Three.js model of the YHS robot.
 * @returns robotGroup — ready to scene.add()
 */
export function buildYhsRobot(): THREE.Group {
  const robotGroup = new THREE.Group()

  // Ground grid
  const grid = new THREE.GridHelper(400, 20, 0x1a2f4a, 0x0e1d2e)
  grid.position.y = 0.05
  robotGroup.add(grid)

  // Shadow ellipse
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1, 32),
    new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.28, depthWrite: false }),
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.scale.set(38, 18, 1)
  shadow.position.set(0, 0.15, 5)
  robotGroup.add(shadow)

  // Upper body
  const upperH = DIM.bodyH - CHASSIS_H
  const bodyMesh = new THREE.Mesh(
    new THREE.BoxGeometry(DIM.bodyW, upperH, DIM.bodyD),
    mkMat(C.body, { metalness: 0.06, roughness: 0.52 }),
  )
  bodyMesh.position.set(0, CHASSIS_H + upperH / 2, 0)
  robotGroup.add(bodyMesh)

  // Head junction trim strip
  const junction = new THREE.Mesh(
    new THREE.BoxGeometry(DIM.headW, 1.2, DIM.headD),
    glowMat(C.accent, 0.12),
  )
  junction.position.set(0, bodyTop + 0.6, headCenterZ)
  robotGroup.add(junction)

  // Head (chamfered)
  const headMesh = new THREE.Mesh(buildHeadGeo(), mkMat(C.head, {
    metalness: 0.10, roughness: 0.42, side: THREE.DoubleSide,
  }))
  headMesh.rotation.x = -Math.PI / 2
  headMesh.position.set(0, bodyTop, 0)
  robotGroup.add(headMesh)

  // Head blue strip
  const headStrip = new THREE.Mesh(
    new THREE.BoxGeometry(DIM.headW * 0.65, 2.5, 0.5),
    glowMat(C.accent, 0.22),
  )
  headStrip.position.set(0, bodyTop + DIM.headH * 0.36, headFrontZ - 0.3)
  robotGroup.add(headStrip)

  // Lidar base + lidar
  const lidarBaseY = headTop + 1
  const lidarBase = new THREE.Mesh(
    new THREE.CylinderGeometry(DIM.lidarR + 1, DIM.lidarR + 1.5, 2, 16),
    mkMat(C.lidarBs, { metalness: 0.55, roughness: 0.4 }),
  )
  lidarBase.position.set(0, lidarBaseY, headCenterZ)
  robotGroup.add(lidarBase)

  const lidarMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(DIM.lidarR, DIM.lidarR, DIM.lidarH, 16),
    glowMat(C.lidar, 0.22),
  )
  lidarMesh.position.set(0, lidarBaseY + 1 + DIM.lidarH / 2, headCenterZ)
  robotGroup.add(lidarMesh)

  // Four wheels
  const wheelGeo = new THREE.CylinderGeometry(DIM.wheelR, DIM.wheelR, DIM.wheelT, 32)
  const hubGeo   = new THREE.CylinderGeometry(7.5, 7.5, DIM.wheelT + 1, 6)
  for (const p of [
    { x: -21, z: -20 }, { x: 21, z: -20 },
    { x: -21, z:  20 }, { x: 21, z:  20 },
  ]) {
    const wg = new THREE.Group()
    wg.position.set(p.x, DIM.wheelR, p.z)
    const tire = new THREE.Mesh(wheelGeo, mkMat(C.wheel, { metalness: 0.03, roughness: 0.92 }))
    tire.rotation.z = Math.PI / 2
    const hub = new THREE.Mesh(hubGeo, mkMat(C.hub, { metalness: 0.72, roughness: 0.32 }))
    hub.rotation.z = Math.PI / 2
    wg.add(tire, hub)
    robotGroup.add(wg)
  }

  return robotGroup
}

/**
 * Default descriptions of the YHS robot's 6 ultrasonic sensors.
 * position unit: mm (per the SensorDef API); 1 scene unit = 10mm, converted by BeamOverlay mmPerUnit:10.
 * DIM constants are in scene units, so ×10 gives mm.
 */
export const YHS_SENSOR_DEFS = (() => {
  const F = 0.7071
  const usChamferX = (DIM.headW / 2 - DIM.chamfer + DIM.headW / 2) / 2  // scene units ≈21.75
  const usChamferZ = (headFrontZ + headFrontZ + DIM.chamfer) / 2          // scene units ≈-32.25
  /** scene units -> mm */
  const mm = (v: number) => v * 10

  // Only describe each sensor's key/position/direction; the beam shape comes from ULTRASONIC_PRESET
  // (range 0.25–1.0m).
  return [
    { key: 'right_rear',  position: { x: mm(-15),          y: mm(52), z: mm(headFrontZ - 1)      }, direction: { x:  0, y: 0, z: -1 } },
    { key: 'rear_right',  position: { x: mm( 15),          y: mm(52), z: mm(headFrontZ - 1)      }, direction: { x:  0, y: 0, z: -1 } },
    { key: 'right_front', position: { x: mm(-usChamferX),  y: mm(55), z: mm(usChamferZ)          }, direction: { x: -F, y: 0, z: -F } },
    { key: 'rear_left',   position: { x: mm( usChamferX),  y: mm(55), z: mm(usChamferZ)          }, direction: { x:  F, y: 0, z: -F } },
    { key: 'front_left',  position: { x: mm(-20),          y: mm(35), z: mm(DIM.bodyD / 2 + 1)  }, direction: { x:  0, y: 0, z:  1 } },
    { key: 'left_rear',   position: { x: mm( 20),          y: mm(35), z: mm(DIM.bodyD / 2 + 1)  }, direction: { x:  0, y: 0, z:  1 } },
  ].map(s => withPreset(ULTRASONIC_PRESET, s))
})()
