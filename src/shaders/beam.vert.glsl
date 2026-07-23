// Output each vertex's world position for the fragment shader's cone-membership test
varying vec3 vWorldPos;

void main() {
  vec4 worldPos4 = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos4.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos4;
}
