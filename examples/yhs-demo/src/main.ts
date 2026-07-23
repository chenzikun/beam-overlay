import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { BeamOverlay } from 'beam-overlay'
import { buildYhsRobot, YHS_SENSOR_DEFS } from './buildYhsRobot'

// ── 场景初始化 ────────────────────────────────────────────────────────────────
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

// ── 灯光 ──────────────────────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0xffffff, 0.75))
const key = new THREE.DirectionalLight(0xfff5e8, 1.3)
key.position.set(-60, 120, -90)
scene.add(key)
const fill = new THREE.DirectionalLight(0xd0e4ff, 0.55)
fill.position.set(90, 40, 70)
scene.add(fill)

// ── YHS 机器人模型 ────────────────────────────────────────────────────────────
const robotGroup = buildYhsRobot()
scene.add(robotGroup)

// ── 波束 overlay ──────────────────────────────────────────────────────────────
// 场景 1 unit = 10mm，与 SensorDef 的 mm 单位对应
const overlay = new BeamOverlay(YHS_SENSOR_DEFS, { mmPerUnit: 10 })
scene.add(overlay.group)

// ── 模拟测距数据 ──────────────────────────────────────────────────────────────
// 每 3s 随机选 2 个传感器更新数值，其余保持不变
const CYCLE_SEC = 3
const sensorKeys = YHS_SENSOR_DEFS.map(s => s.key)

// 初始固定值：各传感器随机分布在量程中段
const currentReadings: Record<string, number | null> = {}
sensorKeys.forEach(k => { currentReadings[k] = 500 + Math.random() * 800 })

let cycleTimer = 0   // 距下次更新的倒计时（秒）

function stepMock(dt: number): void {
  cycleTimer -= dt
  if (cycleTimer > 0) return

  // 重置计时器
  cycleTimer = CYCLE_SEC

  // 随机选 2 个不重复的索引
  const idx1 = Math.floor(Math.random() * sensorKeys.length)
  let idx2 = Math.floor(Math.random() * (sensorKeys.length - 1))
  if (idx2 >= idx1) idx2++

  for (const idx of [idx1, idx2]) {
    const k = sensorKeys[idx]
    const roll = Math.random()
    // 20% 概率无障碍物，80% 概率随机距离 250~2000mm
    currentReadings[k] = roll < 0.2 ? null : 250 + Math.random() * 1750
  }
}

// ── 动画循环 ──────────────────────────────────────────────────────────────────
const clock = new THREE.Clock()

function animate() {
  requestAnimationFrame(animate)
  const dt = Math.min(clock.getDelta(), 0.05)
  controls.update()

  overlay.tick(dt)

  // 每 3s 只更新 2 个传感器的读数，其余保持稳定
  stepMock(dt)
  overlay.update(currentReadings)

  renderer.render(scene, camera)
}

animate()

// ── 窗口缩放 ──────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight, false)
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
})
