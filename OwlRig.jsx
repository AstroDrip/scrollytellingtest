import owlBodyBack from './assets/owl-body-back.png';
import owlTailBack from './assets/owl-tail-back.png';
import owlWingBase from './assets/owl-wing-base.png';
import owlWingInner from './assets/owl-wing-inner.png';
import owlWingMid from './assets/owl-wing-mid.png';
import owlWingOuter from './assets/owl-wing-outer.png';
import owlWingTip from './assets/owl-wing-tip.png';
import {
  BODY_SCALE,
  TAIL_RIG,
  WING_BONES,
  WING_FEATHER_ATTACHMENTS,
  WING_SCALE,
  WING_SHOULDER,
  imagePlacementFromSourcePivot,
  owlCameraAnchor,
} from './owlRigMath.js';

const WING_SOURCE_W = 1448;
const WING_SOURCE_H = 1086;

// Magenta guide-root coordinates in the current source PNG canvases. Keep the
// canvas dimensions unchanged when the guide pixels are eventually removed.
const WING_SPECS = Object.freeze({
  base:  { image: owlWingBase,  sourcePivotX: 1242, sourcePivotY: 652 },
  inner: { image: owlWingInner, sourcePivotX: 1279, sourcePivotY: 729 },
  mid:   { image: owlWingMid,   sourcePivotX: 1355, sourcePivotY: 796 },
  outer: { image: owlWingOuter, sourcePivotX: 1342, sourcePivotY: 904 },
  tip:   { image: owlWingTip,   sourcePivotX: 1334, sourcePivotY: 779 },
});

function FeatherLayer({ attachment }) {
  const spec = WING_SPECS[attachment.name];
  const box = imagePlacementFromSourcePivot({
    sourceWidth: WING_SOURCE_W,
    sourceHeight: WING_SOURCE_H,
    sourcePivotX: spec.sourcePivotX,
    sourcePivotY: spec.sourcePivotY,
    destinationPivotX: attachment.x,
    destinationPivotY: attachment.y,
    scale: WING_SCALE,
  });

  return (
    <g transform={`rotate(${attachment.rotate} ${attachment.x} ${attachment.y})`}>
      <image
        href={spec.image}
        x={box.x}
        y={box.y}
        width={box.width}
        height={box.height}
        preserveAspectRatio="xMidYMid meet"
      />
      {/* Temporary paint-over for the baked magenta root guide. The torso
          masks the shoulder guide; these covers hide elbow/wrist guides. */}
      <circle cx={attachment.x} cy={attachment.y} r="2.2" fill="#f3f1ed" />
    </g>
  );
}

function StructuralBone({ index, flexPrefix }) {
  const bone = WING_BONES[index];
  const attachments = WING_FEATHER_ATTACHMENTS.filter((item) => item.bone === bone.name);
  const next = WING_BONES[index + 1];

  return (
    <g
      className={`wing-pose-joint ${flexPrefix}-pose-joint`}
      data-px="0"
      data-py="0"
      data-joint-index={index}
    >
      <g
        className={`wing-flex ${flexPrefix}-flex`}
        data-px="0"
        data-py="0"
        data-wave-index={bone.waveIndex}
      >
        <g
          className={`wing-idle ${flexPrefix}-idle`}
          data-px="0"
          data-py="0"
          data-wave-index={bone.waveIndex}
        >
          {attachments.map((attachment) => (
            <FeatherLayer key={attachment.name} attachment={attachment} />
          ))}

          {next && (
            <g transform={`translate(${next.x} ${next.y})`}>
              <StructuralBone index={index + 1} flexPrefix={flexPrefix} />
            </g>
          )}
        </g>
      </g>
    </g>
  );
}

function WingLayer({ wingClass, flexPrefix, side }) {
  const x = side === 'left' ? -WING_SHOULDER.x : WING_SHOULDER.x;
  const flip = side === 'right' ? ' scale(-1 1)' : '';

  return (
    <g transform={`translate(${x} ${WING_SHOULDER.y})${flip}`}>
      {/* .wn/.wf remain the existing large shoulder controls. Everything
          below them is local bird-like structure, not five independent wings. */}
      <g className={`wing ${wingClass}`}>
        <g className={`wing-pose-root ${flexPrefix}-pose-root`} opacity="0">
          <StructuralBone index={0} flexPrefix={flexPrefix} />
        </g>
      </g>
    </g>
  );
}

export default function OwlRig() {
  const bodyW = 1254 * BODY_SCALE;
  const bodyH = 1254 * BODY_SCALE;
  const tailBox = imagePlacementFromSourcePivot({
    sourceWidth: 1254,
    sourceHeight: 1254,
    sourcePivotX: TAIL_RIG.sourcePivotX,
    sourcePivotY: TAIL_RIG.sourcePivotY,
    destinationPivotX: 0,
    destinationPivotY: 0,
    scale: TAIL_RIG.scale,
  });
  const cam = owlCameraAnchor();

  return (
    <g id="owl-flight" opacity="0">
      <g id="owl-rotor">
        {/* Tail root is fixed beneath the torso; #owl-tail-pose changes only
            its flight/perch silhouette without moving the attachment point. */}
        <g transform={`translate(${TAIL_RIG.x} ${TAIL_RIG.y})`}>
          <g id="owl-tail-pose">
            <image
              id="owl-tail"
              href={owlTailBack}
              x={tailBox.x}
              y={tailBox.y}
              width={tailBox.width}
              height={tailBox.height}
            />
          </g>
        </g>

        <WingLayer wingClass="wf" flexPrefix="wf" side="left" />
        <WingLayer wingClass="wn" flexPrefix="wn" side="right" />

        {/* Torso renders over both shoulder roots, visually welding the wing
            covers into the body while leaving almost the full wing visible. */}
        <g id="owl-body-pose">
          <image
            id="owl-body"
            href={owlBodyBack}
            x={-bodyW / 2}
            y={-bodyH / 2}
            width={bodyW}
            height={bodyH}
          />
        </g>

        <rect
          id="owl-camera-anchor"
          x={cam.x - 0.5}
          y={cam.y - 0.5}
          width="1"
          height="1"
          fill="transparent"
          pointerEvents="none"
        />

        {/* Existing choreography still targets this selector. Ear artwork is
            baked into owl-body-back.png, so this remains a compatibility hook. */}
        <g id="owl-ears" />
      </g>
    </g>
  );
}
