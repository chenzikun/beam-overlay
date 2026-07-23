// MAX_SENSORS 由 JS 侧通过 #define 注入（vite-plugin-glsl 不支持，改用固定常量）
#define MAX_SENSORS 8

// 其他传感器参数（当前传感器自身不包含在内）
uniform vec3  uOtherApex[MAX_SENSORS];
uniform vec3  uOtherDir[MAX_SENSORS];   // 已归一化
uniform float uOtherTanH[MAX_SENSORS];  // tan(水平半角)
uniform float uOtherTanV[MAX_SENSORS];  // tan(垂直半角)
uniform float uOtherRange[MAX_SENSORS]; // 当前有效探测距离（Three.js scene units）
uniform int   uOtherCount;              // 实际填入的传感器数量（≤ MAX_SENSORS）

// 当前波束自身参数（用于自身裁切）
//   锥面模式（uSelfConeClip=0）：只做球面裁切，锥面不超过探测球
//   球缺模式（uSelfConeClip=1）：做椭圆锥裁切，球缺只在波束锥角内显示
uniform vec3  uOwnApex;        // 传感器位置（world space，scene units）
uniform vec3  uOwnDir;         // 波束方向（已归一化，world space）
uniform float uOwnTanH;        // tan(水平半角)
uniform float uOwnTanV;        // tan(垂直半角)
uniform float uOwnRange;       // 当前有效探测距离（scene units）
uniform int   uSelfConeClip;   // 0=锥体模式（球面裁切）  1=球缺模式（+锥角裁切）

// 当前波束的渲染参数
uniform float uOpacity;       // 透明度
uniform vec3  uColor;         // 颜色（由 JS 侧按 proximityRatio 计算后传入）

varying vec3 vWorldPos;

/**
 * 构建正交基：forward/right/up。
 * 当 forward 接近 ±Y 时换用 X 轴辅助，防止退化。
 * 与 math.ts buildOrthoBase() 逻辑 1:1 对应。
 */
void buildOrthoBase(
  in  vec3 forward,
  out vec3 right,
  out vec3 up
) {
  vec3 helper = abs(forward.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  right = normalize(cross(forward, helper));
  up    = cross(right, forward);
}

/**
 * 判断 worldPos 是否落在第 i 个传感器的"冰淇淋"实体内：
 *   { 椭圆锥内 } ∩ { 到 apex 距离 ≤ range（球缺封口） }
 * 与 math.ts pointInEllipticCone() 逻辑 1:1 对应。
 *
 * 注意两处几何要点：
 *   1. 用椭圆方程 eH²+eV²≤1，而非矩形盒子（dH≤.. && dV≤..）；
 *   2. 末端用球面封口 dot(v,v)≤range²，而非轴向切片 proj≤range。
 */
bool insideOtherCone(vec3 p, int i) {
  vec3  v    = p - uOtherApex[i];
  float proj = dot(v, uOtherDir[i]);
  if (proj <= 0.0) return false;                              // 传感器背后
  if (dot(v, v) > uOtherRange[i] * uOtherRange[i]) return false; // 超出球缺

  vec3 right, up;
  buildOrthoBase(uOtherDir[i], right, up);

  float eH = abs(dot(v, right)) / (proj * uOtherTanH[i]);
  float eV = abs(dot(v, up))    / (proj * uOtherTanV[i]);
  return eH * eH + eV * eV <= 1.0;                            // 椭圆截面
}

void main() {
  // ── 自身裁切
  if (uSelfConeClip == 0) {
    // 锥体侧面：用球面裁切，使锥面在探测球处闭合（与球缺严丝合缝）。
    // 锥体网格的底沿距 apex 为 range·√(1+tan²)>range，必须裁到 range。
    if (length(vWorldPos - uOwnApex) > uOwnRange) discard;
  } else {
    // 球缺：网格本身即 dist=range 的球面，只需裁到本波束椭圆锥角内。
    // （不再做球面裁切，避免浮点等值比较在球面上造成孔洞。）
    vec3  sv = vWorldPos - uOwnApex;
    float sp = dot(sv, uOwnDir);
    if (sp <= 0.0) discard;
    vec3 sRight, sUp;
    buildOrthoBase(uOwnDir, sRight, sUp);
    float eH = abs(dot(sv, sRight)) / (sp * uOwnTanH);
    float eV = abs(dot(sv, sUp))    / (sp * uOwnTanV);
    if (eH * eH + eV * eV > 1.0) discard;                     // 椭圆锥角裁切
  }

  // ── 其他锥体遮挡裁切（正面/背面一律裁切）
  // 目标：渲染多个波束"并集"的外壳，剔除所有落在其他波束实体内部的表面
  // （无论正面还是背面）。这样：
  //   · 相交处内部的分隔壁被剔除（不再出现内部表面）；
  //   · 凸出到其他锥体之外的外壳被保留（外表面不丢失）。
  // 依赖 insideOtherCone 的精确椭圆+球缺判定，避免盒子判定过度裁切。
  for (int i = 0; i < MAX_SENSORS; i++) {
    if (i >= uOtherCount) break;
    if (insideOtherCone(vWorldPos, i)) discard;
  }

  // 背面略微减弱，透明叠加时提供深度层次（不影响裁切逻辑）
  float effectiveOpacity = gl_FrontFacing ? uOpacity : uOpacity * 0.6;
  gl_FragColor = vec4(uColor, effectiveOpacity);
}
