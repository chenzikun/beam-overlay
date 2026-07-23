import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { BeamOverlay } from 'beam-overlay'
import { buildYhsRobot, YHS_SENSOR_DEFS } from './buildYhsRobot'

// -- Scene setup ---------------------------------------------------------------
const canvas = document.getElementById('c') as HTMLCanvasElement
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight, false)
renderer.setClearColor(0x0a0e18)
renderer.toneMapping = THREE.ACESFilmicToneMapping

const scene  = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 1, 1000)
camera.position.set(-95, 140, -220)

const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true
controls.dampingFactor = 0.08
controls.target.set(0, 40, 0)
controls.minDistance = 80
controls.maxDistance = 600
controls.maxPolarAngle = Math.PI / 2.05
controls.update()

// -- Lights --------------------------------------------------------------------
scene.add(new THREE.AmbientLight(0xffffff, 0.75))
const key = new THREE.DirectionalLight(0xfff5e8, 1.3)
key.position.set(-60, 120, -90)
scene.add(key)
const fill = new THREE.DirectionalLight(0xd0e4ff, 0.55)
fill.position.set(90, 40, 70)
scene.add(fill)

// -- YHS robot model -----------------------------------------------------------
const robotGroup = buildYhsRobot()
scene.add(robotGroup)

// -- Beam overlay --------------------------------------------------------------
// Scene 1 unit = 10mm, matching the mm unit of SensorDef
const overlay = new BeamOverlay(YHS_SENSOR_DEFS, { mmPerUnit: 10 })
scene.add(overlay.group)

// -- Mock range data -----------------------------------------------------------
// Every 3s, randomly pick 2 sensors to update; the rest stay unchanged
const CYCLE_SEC = 3
const sensorKeys = YHS_SENSOR_DEFS.map(s => s.key)

// Initial fixed values: each sensor randomly placed in the mid-range
const currentReadings: Record<string, number | null> = {}
sensorKeys.forEach(k => { currentReadings[k] = 500 + Math.random() * 800 })

let cycleTimer = 0   // countdown to the next update (seconds)

function stepMock(dt: number): void {
  cycleTimer -= dt
  if (cycleTimer > 0) return

  // Reset the timer
  cycleTimer = CYCLE_SEC

  // Pick 2 distinct random indices
  const idx1 = Math.floor(Math.random() * sensorKeys.length)
  let idx2 = Math.floor(Math.random() * (sensorKeys.length - 1))
  if (idx2 >= idx1) idx2++

  for (const idx of [idx1, idx2]) {
    const k = sensorKeys[idx]
    const roll = Math.random()
    // 20% chance of no obstacle, 80% chance of a random distance 250~2000mm
    currentReadings[k] = roll < 0.2 ? null : 250 + Math.random() * 1750
  }
}

// -- Animation loop ------------------------------------------------------------
const clock = new THREE.Clock()

function animate() {
  requestAnimationFrame(animate)
  const dt = Math.min(clock.getDelta(), 0.05)
  controls.update()

  overlay.tick(dt)

  // Every 3s update only 2 sensors' readings, the rest stay stable
  stepMock(dt)
  overlay.update(currentReadings)

  renderer.render(scene, camera)
}

animate()

// -- Window resize -------------------------------------------------------------
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight, false)
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
})
