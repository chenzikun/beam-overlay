// 输出每个顶点的世界坐标，供 fragment shader 做锥内点测试
varying vec3 vWorldPos;

void main() {
  vec4 worldPos4 = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos4.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos4;
}
