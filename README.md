# beam-overlay

[![npm version](https://img.shields.io/npm/v/beam-overlay.svg)](https://www.npmjs.com/package/beam-overlay)
[![license](https://img.shields.io/npm/l/beam-overlay.svg)](./LICENSE)

方向性距离传感器**探测体**的 Three.js 3D 叠加可视化库。

每个传感器渲染为「椭圆锥 + 球缺」实体（探测波束），多个波束重叠时通过 GLSL
fragment shader **逐片元裁切内部表面**，只保留并集外壳，从而高亮危险区。

与具体传感器类型无关——超声波、毫米波雷达、红外测距、ToF 等均可使用；
`ULTRASONIC_PRESET` 只是内置的一个便捷波束形状预设。

## 安装

```bash
npm install beam-overlay
# three 为 peerDependency，需自行安装
npm install three
```

## 使用

```ts
import * as THREE from 'three'
import { BeamOverlay, ULTRASONIC_PRESET, withPreset } from 'beam-overlay'

// 方式一：完整手写 SensorDef
const overlay = new BeamOverlay([
  {
    key: 'front_left',
    position:       { x: -150, y: 500, z: -362 },  // mm，Y轴朝上
    direction:      { x: 0, y: 0, z: -1 },
    beamAngleHDeg:  45,
    beamAngleVDeg:  20,
    minRangeMm:     250,
    maxRangeMm:     1000,
  },
  // ... 最多 8 个传感器
])

// 方式二：用预设补全形状，只写 key/position/direction（推荐）
const sensors = [
  { key: 'front_left',  position: { x: -150, y: 500, z: -362 }, direction: { x: 0, y: 0, z: -1 } },
  { key: 'front_right', position: { x:  150, y: 500, z: -362 }, direction: { x: 0, y: 0, z: -1 } },
].map(s => withPreset(ULTRASONIC_PRESET, s))
const overlay2 = new BeamOverlay(sensors)

scene.add(overlay.group)  // 与机器人模型挂入同一 scene，坐标系对齐

// 宿主动画循环
function animate() {
  requestAnimationFrame(animate)
  const dt = clock.getDelta()

  overlay.tick(dt)
  overlay.update({
    front_left:  820,   // mm，检测到障碍物
    front_right: null,  // 无障碍物
  })

  renderer.render(scene, camera)
}

// 销毁时释放 GPU 资源
overlay.dispose()
```

> 若场景单位不是 mm（如 1 unit = 10mm），传入 `new BeamOverlay(sensors, { mmPerUnit: 10 })`。

## API

### `new BeamOverlay(sensors: SensorDef[], options?: { mmPerUnit?: number })`

- `sensors`：传感器定义数组（最多 8 个，`MAX_SENSORS`）
- `options.mmPerUnit`：场景换算系数，1 scene unit = mmPerUnit mm，默认 1

### `overlay.group: THREE.Group`

挂入宿主 `scene` 的节点，包含所有波束几何体。

### `overlay.tick(dt: number): void`

每帧调用，驱动脉动动画。`dt` 单位：秒。

### `overlay.update(readings: Readings): void`

传入最新测距数据更新渲染。`readings` 的 key 对应 `SensorDef.key`，值为距离 mm 或 `null`（无障碍物）。

### `overlay.getFrameData(): FrameData`

返回当前帧的计算结果（用于业务逻辑消费）。

### `overlay.dispose(): void`

释放所有 GPU 资源。

### 预设

- `ULTRASONIC_PRESET: BeamPreset` — 典型超声波波束形状（H45°/V20°，量程 0.25–1.0m）
- `withPreset(preset, { key, position, direction, ...overrides }): SensorDef` — 用预设补全形状参数，任意字段可覆盖

## 坐标系

- 单位：毫米（mm）
- 坐标系：右手系，Y 轴朝上（与 Three.js 默认一致）
- 调用方负责将 `position` 与机器人模型坐标系对齐

## 示例（Demo）

`examples/yhs-demo` 是一个用 Three.js 渲染 YHS 机器人 + 6 路超声波波束叠加的完整示例。

```bash
# 先构建库（demo 通过 file:../.. 引用构建产物）
npm install
npm run build

# 运行 demo
cd examples/yhs-demo
npm install
npm run dev
```

## 开发

```bash
npm install
npm test          # vitest 单元测试
npm run build     # 构建 dist + 类型声明
```

## License

[MIT](./LICENSE) © zicorn
