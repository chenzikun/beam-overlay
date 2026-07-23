// MAX_SENSORS is a fixed constant here (vite-plugin-glsl does not support #define injection from JS)
#define MAX_SENSORS 8

// Parameters of the OTHER sensors (the current sensor itself is not included)
uniform vec3  uOtherApex[MAX_SENSORS];
uniform vec3  uOtherDir[MAX_SENSORS];   // normalized
uniform float uOtherTanH[MAX_SENSORS];  // tan(horizontal half-angle)
uniform float uOtherTanV[MAX_SENSORS];  // tan(vertical half-angle)
uniform float uOtherRange[MAX_SENSORS]; // current effective detection distance (scene units)
uniform int   uOtherCount;              // number of sensors actually filled in (<= MAX_SENSORS)

// Parameters of the current beam itself (used for self-clipping)
//   cone mode (uSelfConeClip=0): sphere clip only, so the cone surface never exceeds the detection sphere
//   cap  mode (uSelfConeClip=1): elliptic-cone clip, so the cap only shows within the beam's cone angle
uniform vec3  uOwnApex;        // sensor position (world space, scene units)
uniform vec3  uOwnDir;         // beam direction (normalized, world space)
uniform float uOwnTanH;        // tan(horizontal half-angle)
uniform float uOwnTanV;        // tan(vertical half-angle)
uniform float uOwnRange;       // current effective detection distance (scene units)
uniform int   uSelfConeClip;   // 0 = cone mode (sphere clip)  1 = cap mode (+ cone-angle clip)

// Render parameters of the current beam
uniform float uOpacity;       // opacity
uniform vec3  uColor;         // color (computed on the JS side from proximityRatio)

varying vec3 vWorldPos;

/**
 * Build an orthonormal basis: forward/right/up.
 * When forward is close to ±Y, use the X axis as the helper to avoid degeneracy.
 * Kept in 1:1 correspondence with buildOrthoBase() in math.ts.
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
 * Test whether worldPos lies inside the "ice-cream" solid of the i-th sensor:
 *   { inside the elliptic cone } ∩ { within distance `range` of the apex (spherical cap) }
 * Kept in 1:1 correspondence with pointInEllipticCone() in math.ts.
 *
 * Two geometry notes:
 *   1. Use the ellipse equation eH^2 + eV^2 <= 1, not an axis-aligned box (dH <= .. && dV <= ..);
 *   2. Cap the far end with a sphere: dot(v,v) <= range^2, not the axial slice proj <= range.
 */
bool insideOtherCone(vec3 p, int i) {
  vec3  v    = p - uOtherApex[i];
  float proj = dot(v, uOtherDir[i]);
  if (proj <= 0.0) return false;                                 // behind the sensor
  if (dot(v, v) > uOtherRange[i] * uOtherRange[i]) return false; // beyond the spherical cap

  vec3 right, up;
  buildOrthoBase(uOtherDir[i], right, up);

  float eH = abs(dot(v, right)) / (proj * uOtherTanH[i]);
  float eV = abs(dot(v, up))    / (proj * uOtherTanV[i]);
  return eH * eH + eV * eV <= 1.0;                               // elliptic cross-section
}

void main() {
  // -- Self clipping
  if (uSelfConeClip == 0) {
    // Cone side: clip against the sphere so the cone surface closes exactly on the detection
    // sphere (flush with the cap). The cone mesh's base rim is at distance range*sqrt(1+tan^2) > range,
    // so it must be clipped down to range.
    if (length(vWorldPos - uOwnApex) > uOwnRange) discard;
  } else {
    // Cap: the mesh is already the sphere at dist=range, so we only clip to this beam's cone angle.
    // (No sphere clip here, to avoid holes from floating-point equality tests on the sphere.)
    vec3  sv = vWorldPos - uOwnApex;
    float sp = dot(sv, uOwnDir);
    if (sp <= 0.0) discard;
    vec3 sRight, sUp;
    buildOrthoBase(uOwnDir, sRight, sUp);
    float eH = abs(dot(sv, sRight)) / (sp * uOwnTanH);
    float eV = abs(dot(sv, sUp))    / (sp * uOwnTanV);
    if (eH * eH + eV * eV > 1.0) discard;                        // elliptic cone-angle clip
  }

  // -- Occlusion clipping against other cones (both front and back faces are clipped)
  // Goal: render the outer shell of the UNION of the beams, discarding every surface that
  // lies inside another beam's solid (whether front- or back-facing). This means:
  //   - internal dividing walls at intersections are removed (no more inner surfaces);
  //   - the shell that pokes outside the other cones is preserved (outer surfaces are kept).
  // Relies on insideOtherCone's exact ellipse + sphere test to avoid the over-clipping of a box test.
  for (int i = 0; i < MAX_SENSORS; i++) {
    if (i >= uOtherCount) break;
    if (insideOtherCone(vWorldPos, i)) discard;
  }

  // Back faces are slightly dimmer to give a sense of depth in transparent blending (does not affect clipping)
  float effectiveOpacity = gl_FrontFacing ? uOpacity : uOpacity * 0.6;
  gl_FragColor = vec4(uColor, effectiveOpacity);
}
