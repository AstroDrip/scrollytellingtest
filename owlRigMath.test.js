import test from 'node:test';
import assert from 'node:assert/strict';
import * as rigMath from './owlRigMath.js';
import {
  imagePlacementFromSourcePivot,
  wingPoseSpreadAt,
  shouldIdleWingAnimate,
} from './owlRigMath.js';

test('root-anchored placement maps the source pivot exactly onto the rig pivot', () => {
  const box = imagePlacementFromSourcePivot({
    sourceWidth: 1448,
    sourceHeight: 1086,
    sourcePivotX: 1242,
    sourcePivotY: 652,
    destinationPivotX: 24,
    destinationPivotY: -20,
    scale: 0.055,
  });

  assert.equal(Number((box.x + 1242 * 0.055).toFixed(6)), 24);
  assert.equal(Number((box.y + 652 * 0.055).toFixed(6)), -20);
});

test('wing pose is folded while perched and opens during first-flight anticipation', () => {
  assert.equal(wingPoseSpreadAt(2500), 0);
  assert.equal(wingPoseSpreadAt(3000), 0);
  assert.ok(wingPoseSpreadAt(3500) > 0 && wingPoseSpreadAt(3500) < 1);
  assert.equal(wingPoseSpreadAt(4000), 1);
});

test('wing pose folds for the hunt perch and reopens for the swoop', () => {
  assert.equal(wingPoseSpreadAt(12750), 0);
  assert.equal(wingPoseSpreadAt(13499), 0);
  assert.ok(wingPoseSpreadAt(13600) > 0);
  assert.equal(wingPoseSpreadAt(13700), 1);
});

test('wing pose folds for burrow descent, reopens underground, and folds after landing', () => {
  assert.equal(wingPoseSpreadAt(15450), 0);
  assert.ok(wingPoseSpreadAt(16620) > 0 && wingPoseSpreadAt(16620) < 1);
  assert.equal(wingPoseSpreadAt(16800), 1);
  assert.equal(wingPoseSpreadAt(22850), 0);
});

test('idle motion only starts after scrolling has actually paused', () => {
  const ranges = [[4000, 10000], [16000, 22000]];
  assert.equal(shouldIdleWingAnimate(1000, 900, 5000, ranges, 180), false);
  assert.equal(shouldIdleWingAnimate(1100, 900, 5000, ranges, 180), true);
  assert.equal(shouldIdleWingAnimate(1100, 900, 12000, ranges, 180), false);
});

test('tail placement begins below the torso centre and stays behind the body', () => {
  const tail = rigMath.tailRigPlacement();
  assert.ok(tail.y > 0);
  assert.ok(tail.scale < 0.1);
  assert.equal(tail.layer, 'behind-body');
});

test('camera anchor is fixed to the torso and independent of wing spread', () => {
  assert.deepEqual(rigMath.owlCameraAnchor(0), rigMath.owlCameraAnchor(1));
  assert.deepEqual(rigMath.owlCameraAnchor(0.37), rigMath.owlCameraAnchor(0.82));
});

test('folded flight feathers collapse into the body instead of ghosting as a fan', () => {
  const folded = rigMath.wingPoseVisualAt(2500);
  const partial = rigMath.wingPoseVisualAt(11500);
  const flight = rigMath.wingPoseVisualAt(5000);
  assert.equal(folded.opacity, 0);
  assert.ok(folded.scaleX < partial.scaleX);
  assert.ok(partial.scaleX < flight.scaleX);
  assert.equal(flight.opacity, 1);
  assert.equal(flight.scaleX, 1);
});

test('wing skeleton uses three widely spaced structural joints rather than five tiny nested feather joints', () => {
  assert.equal(rigMath.WING_BONES.length, 3);
  assert.deepEqual(rigMath.WING_BONES.map((bone) => bone.name), ['shoulder', 'elbow', 'wrist']);
  const roots = rigMath.wingBoneRoots();
  assert.ok(Math.abs(roots[1].x - roots[0].x) >= 28);
  assert.ok(Math.abs(roots[2].x - roots[1].x) >= 34);
  assert.ok(Math.abs(roots[2].x) >= 65);
});

test('five feather images attach to three structural regions instead of acting as five bones', () => {
  assert.deepEqual(
    rigMath.WING_FEATHER_ATTACHMENTS.map((item) => item.bone),
    ['shoulder', 'elbow', 'elbow', 'wrist', 'wrist']
  );
});

test('shoulder root sits near the visible torso edge so the wing reads as connected', () => {
  assert.ok(rigMath.WING_SHOULDER.x >= 44);
  assert.ok(rigMath.WING_SHOULDER.x <= 52);
  assert.ok(rigMath.WING_SHOULDER.y >= 0);
});

test('glide is broad and restrained while swoop trails the wrist behind the shoulder', () => {
  const glide = rigMath.owlPoseAt(6000);
  const swoop = rigMath.owlPoseAt(14000);
  assert.equal(glide.mode, 'glide');
  assert.ok(Math.abs(glide.wing.joints[0]) <= 2);
  assert.ok(Math.abs(glide.wing.joints[2]) <= 10);
  assert.equal(swoop.mode, 'swoop');
  assert.ok(Math.abs(swoop.wing.joints[2]) > Math.abs(swoop.wing.joints[1]));
  assert.ok(Math.abs(swoop.wing.joints[1]) > Math.abs(swoop.wing.joints[0]));
});

test('tail is raised and narrowed in flight, streamlined further in the hunt, then fans for landing', () => {
  const perch = rigMath.owlPoseAt(2500).tail;
  const glide = rigMath.owlPoseAt(6000).tail;
  const swoop = rigMath.owlPoseAt(14000).tail;
  const landing = rigMath.owlPoseAt(22600).tail;
  assert.ok(glide.translateY < perch.translateY);
  assert.ok(glide.scaleX < perch.scaleX);
  assert.ok(swoop.scaleX < glide.scaleX);
  assert.ok(landing.scaleX > glide.scaleX);
});

test('flight body is slightly compressed and swoop body is more streamlined than glide', () => {
  const perch = rigMath.owlPoseAt(2500).body;
  const glide = rigMath.owlPoseAt(6000).body;
  const swoop = rigMath.owlPoseAt(14000).body;
  assert.equal(perch.scaleY, 1);
  assert.ok(glide.scaleY < perch.scaleY);
  assert.ok(swoop.scaleY < glide.scaleY);
});

test('idle gain leaves the shoulder almost fixed and concentrates correction at the wrist', () => {
  assert.ok(rigMath.idleJointGain(0) <= 0.12);
  assert.ok(rigMath.idleJointGain(2) > rigMath.idleJointGain(0));
  assert.ok(rigMath.idleJointGain(4) > rigMath.idleJointGain(2));
});

test('landing pose begins with the braking stroke rather than waiting for the final fold', () => {
  assert.equal(rigMath.owlPoseAt(22300).mode, 'landing');
  assert.ok(rigMath.owlPoseAt(22300).tail.scaleX > rigMath.owlPoseAt(22000).tail.scaleX);
});
