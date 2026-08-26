export const WING_SCALE = 0.05;
export const BODY_SCALE = 0.1;

// The shoulder now sits just inside the visible torso edge. The body is
// rendered after the wings so ~5px of root overlap is enough to hide seams
// while keeping the broad base visibly connected to the torso.
export const WING_SHOULDER = Object.freeze({ x: 48, y: 5 });

// Three structural joints, not five feather-as-bone hinges.
// Offsets are local to the preceding joint for the unmirrored left/far wing.
export const WING_BONES = Object.freeze([
  Object.freeze({ name: 'shoulder', x: 0, y: 0, waveIndex: 0 }),
  Object.freeze({ name: 'elbow', x: -32, y: 2, waveIndex: 2 }),
  Object.freeze({ name: 'wrist', x: -38, y: 1, waveIndex: 4 }),
]);

// The five PNGs remain useful visual layers; they no longer define five
// kinematic joints. Two feather layers share the elbow and two share wrist.
export const WING_FEATHER_ATTACHMENTS = Object.freeze([
  Object.freeze({ name: 'base', bone: 'shoulder', rotate: -2, x: 0, y: 0 }),
  Object.freeze({ name: 'inner', bone: 'elbow', rotate: -5, x: 0, y: -1 }),
  Object.freeze({ name: 'mid', bone: 'elbow', rotate: 5, x: 1, y: 2 }),
  Object.freeze({ name: 'outer', bone: 'wrist', rotate: -4, x: 0, y: -1 }),
  Object.freeze({ name: 'tip', bone: 'wrist', rotate: 5, x: 1, y: 2 }),
]);

// Tail source root is near the cap at the top of the existing tail PNG.
// Root the artwork, then pose that root rather than placing the whole canvas
// with a magic top-left offset.
export const TAIL_RIG = Object.freeze({
  x: 0,
  y: 38,
  scale: 0.055,
  sourcePivotX: 627,
  sourcePivotY: 235,
  layer: 'behind-body',
});

export const CAMERA_ANCHOR = Object.freeze({ x: 0, y: -3 });

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const smoothstep01 = (value) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;
const lerpArray = (a, b, t) => a.map((value, i) => lerp(value, b[i], t));

export function imagePlacementFromSourcePivot({
  sourceWidth,
  sourceHeight,
  sourcePivotX,
  sourcePivotY,
  destinationPivotX,
  destinationPivotY,
  scale,
}) {
  return {
    x: destinationPivotX - sourcePivotX * scale,
    y: destinationPivotY - sourcePivotY * scale,
    width: sourceWidth * scale,
    height: sourceHeight * scale,
  };
}

export function wingBoneRoots() {
  const roots = [];
  let x = 0;
  let y = 0;
  WING_BONES.forEach((bone, index) => {
    if (index > 0) {
      x += bone.x;
      y += bone.y;
    }
    roots.push({ x, y });
  });
  return roots;
}

// Backward-compatible name for earlier diagnostics; now intentionally three
// roots because the feather layers are attachments rather than extra bones.
export const wingJointRoots = wingBoneRoots;

export function tailRigPlacement() {
  return { ...TAIL_RIG };
}

export function owlCameraAnchor(_wingSpread = 0) {
  return { ...CAMERA_ANCHOR };
}

export function wingPoseSpreadAt(ms) {
  if (ms < 3000) return 0;
  if (ms < 4000) return smoothstep01((ms - 3000) / 1000);
  if (ms < 11000) return 1;
  if (ms < 12000) return 0.42;
  if (ms < 12450) return 0.42 * (1 - smoothstep01((ms - 12000) / 450));
  if (ms < 13500) return 0;
  if (ms < 13700) return smoothstep01((ms - 13500) / 200);
  if (ms < 15000) return 1;
  if (ms < 15400) return 1 - smoothstep01((ms - 15000) / 400);
  if (ms < 16500) return 0;
  if (ms < 16750) return smoothstep01((ms - 16500) / 250);
  if (ms < 22480) return 1;
  if (ms < 22800) return 1 - smoothstep01((ms - 22480) / 320);
  return 0;
}

const JOINT_GLIDE = Object.freeze([0, 3, 7]);
const JOINT_CARE = Object.freeze([0, 2, 4]);
// Swoop is a progressive trail: shoulder barely changes, wrist responds most.
const JOINT_SWOOP = Object.freeze([3, 9, 18]);
const JOINT_LANDING = Object.freeze([-2, 6, 12]);
const JOINT_FOLDED = Object.freeze([0, 0, 0]);

function modeAt(ms) {
  if (ms < 3000) return 'perched';
  if (ms < 4000) return 'takeoff';
  if (ms < 11000) return 'glide';
  if (ms < 12450) return 'care';
  if (ms < 13500) return 'perched';
  if (ms < 15000) return 'swoop';
  if (ms < 16500) return 'folded';
  if (ms < 22250) return 'glide';
  if (ms < 22800) return 'landing';
  return 'perched';
}

function jointsAt(ms, mode, spread) {
  if (mode === 'takeoff') return JOINT_GLIDE.map((v) => v * spread);
  if (mode === 'glide') {
    if (ms < 16750 && ms >= 16500) return JOINT_GLIDE.map((v) => v * spread);
    return [...JOINT_GLIDE];
  }
  if (mode === 'care') return JOINT_CARE.map((v) => v * Math.min(1, spread / 0.42));
  if (mode === 'swoop') {
    if (ms < 13700) {
      const t = smoothstep01((ms - 13500) / 200);
      return lerpArray(JOINT_FOLDED, JOINT_SWOOP, t);
    }
    return [...JOINT_SWOOP];
  }
  if (mode === 'landing') {
    const t = smoothstep01((ms - 22480) / 320);
    return lerpArray(JOINT_LANDING, JOINT_FOLDED, t);
  }
  return [...JOINT_FOLDED];
}

function tailForMode(mode, ms) {
  if (mode === 'glide' || mode === 'takeoff') {
    return { translateY: -12, scaleX: 0.76, scaleY: 0.84, rotate: 0 };
  }
  if (mode === 'swoop') {
    return { translateY: -16, scaleX: 0.58, scaleY: 0.72, rotate: 0 };
  }
  if (mode === 'landing') {
    const t = smoothstep01((ms - 22480) / 320);
    return {
      translateY: lerp(-4, 0, t),
      scaleX: lerp(1.12, 1, t),
      scaleY: lerp(0.96, 1, t),
      rotate: 0,
    };
  }
  if (mode === 'folded') {
    return { translateY: -9, scaleX: 0.68, scaleY: 0.8, rotate: 0 };
  }
  if (mode === 'care') {
    return { translateY: -3, scaleX: 0.9, scaleY: 0.94, rotate: 0 };
  }
  return { translateY: 0, scaleX: 1, scaleY: 1, rotate: 0 };
}

function bodyForMode(mode) {
  if (mode === 'swoop') return { scaleX: 1, scaleY: 0.88, translateY: -4 };
  if (mode === 'glide' || mode === 'takeoff') return { scaleX: 1, scaleY: 0.94, translateY: -2 };
  if (mode === 'folded') return { scaleX: 1, scaleY: 0.92, translateY: -3 };
  if (mode === 'landing') return { scaleX: 1, scaleY: 0.95, translateY: -1 };
  return { scaleX: 1, scaleY: 1, translateY: 0 };
}

export function owlPoseAt(ms) {
  const mode = modeAt(ms);
  const spread = wingPoseSpreadAt(ms);
  const opacity = spread <= 0 ? 0 : Math.min(1, spread / 0.16);
  return {
    mode,
    wing: {
      spread,
      opacity,
      scaleX: 0.62 + 0.38 * spread,
      scaleY: 0.72 + 0.28 * spread,
      joints: jointsAt(ms, mode, spread),
    },
    tail: tailForMode(mode, ms),
    body: bodyForMode(mode),
  };
}

export function wingPoseVisualAt(ms) {
  const wing = owlPoseAt(ms).wing;
  return {
    spread: wing.spread,
    opacity: wing.opacity,
    scaleX: Number(wing.scaleX.toFixed(6)),
    scaleY: Number(wing.scaleY.toFixed(6)),
  };
}

export function idleJointGain(waveIndex) {
  if (waveIndex >= 4) return 1;
  if (waveIndex >= 2) return 0.38;
  return 0.08;
}

export function shouldIdleWingAnimate(now, lastScrollAt, ms, ranges, delayMs = 180) {
  return now - lastScrollAt >= delayMs && ranges.some(([start, end]) => ms >= start && ms < end);
}
