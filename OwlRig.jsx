import owlBodyBack from './assets/owl-body-back.png';
import owlTailBack from './assets/owl-tail-back.png';
import owlWingBase from './assets/owl-wing-base.png';
import owlWingInner from './assets/owl-wing-inner.png';
import owlWingMid from './assets/owl-wing-mid.png';
import owlWingOuter from './assets/owl-wing-outer.png';
import owlWingTip from './assets/owl-wing-tip.png';

/* Photo wing from base (root/shoulder) out to the tip. */
const WING_IMAGES = [owlWingBase, owlWingInner, owlWingMid, owlWingOuter, owlWingTip];

/* ---- TUNE: scale everything to sit inside the ~200-unit owl rig ---- */
const IMAGE_X = {
  WING: 0.055, // 1448x1086 wing art -> ~80x60 rig units
  BODY: 0.1,   // 1254x1254 -> ~125 units
  TAIL: 0.1,
};
const WING_W = 1448 * IMAGE_X.WING;
const WING_H = 1086 * IMAGE_X.WING;

const NEAR_PIVOTS = [
  { px: 12, py: -18 },
  { px: 26, py: -30 },
  { px: 40, py: -42 },
  { px: 54, py: -54 },
  { px: 68, py: -66 },
];

function WingSegment({ segmentIndex, prefixes, image }) {
  const pivot = NEAR_PIVOTS[segmentIndex];
  return (
    <g className={`wing-flex ${prefixes.flex}`} data-px={pivot.px} data-py={pivot.py}>
      <g className={`wing-idle ${prefixes.idle}`} data-px={pivot.px} data-py={pivot.py}>
        <image
          href={image}
          x={pivot.px - WING_W / 2}
          y={pivot.py - WING_H / 2}
          width={WING_W}
          height={WING_H}
        />
      </g>
    </g>
  );
}

function WingLayer({ wingClass, flexPrefix, flip }) {
  return (
    <g transform={flip ? 'scale(-1 1)' : undefined}>
      <g className={`wing ${wingClass}`}>
        {WING_IMAGES.map((image, index) => (
          <WingSegment key={index} segmentIndex={index}
            prefixes={{ flex: flexPrefix + '-flex', idle: flexPrefix + '-idle' }}
            image={image} />
        ))}
      </g>
    </g>
  );
}

export default function OwlRig() {
  const bodyW = 1254 * IMAGE_X.BODY;
  const bodyH = 1254 * IMAGE_X.BODY;
  const tailW = 1254 * IMAGE_X.TAIL;
  const tailH = 1254 * IMAGE_X.TAIL;

  return (
    <g id="owl-flight" opacity="0">
      <g id="owl-rotor">
        <image href={owlTailBack} x={-tailW / 2} y={-tailH * 0.55} width={tailW} height={tailH} opacity="0.9" />
        <WingLayer wingClass="wf" flexPrefix="wf" flip />
        <image href={owlBodyBack} x={-bodyW / 2} y={-bodyH / 2} width={bodyW} height={bodyH} />
        <WingLayer wingClass="wn" flexPrefix="wn" flip={false} />
        <g id="owl-ears" />
      </g>
    </g>
  );
}
