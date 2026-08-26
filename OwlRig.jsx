const FAR_SEGMENTS = [
  { px: 0, py: 0, d: 'M 0 0 C -10 -18 -10 -38 0 -52 C 12 -38 18 -18 14 -2 Z', opacity: 0.72 },
  { px: 4, py: -18, d: 'M 2 -12 C -4 -30 1 -50 10 -64 C 18 -50 21 -31 15 -11 Z', opacity: 0.76 },
  { px: 8, py: -36, d: 'M 6 -29 C 3 -49 8 -68 16 -79 C 24 -64 26 -48 20 -28 Z', opacity: 0.80 },
  { px: 12, py: -54, d: 'M 10 -47 C 9 -66 14 -83 20 -92 C 27 -78 28 -62 23 -46 Z', opacity: 0.84 },
  { px: 16, py: -72, d: 'M 14 -65 C 14 -80 18 -93 21 -99 C 27 -89 27 -78 23 -65 Z', opacity: 0.90 },
];

const NEAR_SEGMENTS = [
  { px: 0, py: 0, d: 'M 0 0 C -6 -22 -2 -42 10 -56 C 22 -42 23 -20 12 -2 Z', opacity: 0.88 },
  { px: 8, py: -22, d: 'M 6 -16 C 3 -39 10 -60 22 -73 C 33 -55 31 -35 18 -14 Z', opacity: 0.90 },
  { px: 17, py: -42, d: 'M 14 -34 C 13 -57 22 -78 34 -90 C 44 -70 41 -50 27 -31 Z', opacity: 0.93 },
  { px: 27, py: -61, d: 'M 24 -52 C 25 -72 33 -92 41 -102 C 49 -84 46 -67 35 -49 Z', opacity: 0.96 },
  { px: 35, py: -80, d: 'M 32 -70 C 34 -87 40 -101 44 -107 C 49 -95 47 -82 41 -68 Z', opacity: 1 },
];

function WingSegments({ prefix, segments, fill }) {
  return segments.map((segment, index) => (
    <g
      key={`${prefix}-${index}`}
      className={`wing-flex ${prefix}-flex`}
      data-px={segment.px}
      data-py={segment.py}
    >
      <g
        className={`wing-idle ${prefix}-idle`}
        data-px={segment.px}
        data-py={segment.py}
      >
        <path
          d={segment.d}
          fill={fill}
          opacity={segment.opacity}
          stroke="#fef3c7"
          strokeWidth="0.7"
          strokeLinejoin="round"
        />
      </g>
    </g>
  ));
}

export default function OwlRig() {
  return (
    <g id="owl-flight" opacity="0">
      <g id="owl-rotor">
        <path d="M -34 18 L -60 46 L -28 42 Z" fill="#fcd34d" />

        {/* Far wing: .wf remains the existing shoulder-level control. */}
        <g transform="translate(-8, -24)">
          <g className="wing wf">
            <WingSegments prefix="wf" segments={FAR_SEGMENTS} fill="#fbbf24" />
          </g>
        </g>

        <path
          d="M -36 6 C -40 -28 -12 -46 14 -42 C 40 -38 50 -12 44 14 C 38 40 8 52 -12 44 C -30 38 -33 24 -36 6 Z"
          fill="#fef3c7"
        />
        <circle cx="-6" cy="8" r={3} fill="#f59e0b" opacity="0.5" />
        <circle cx="8" cy="2" r={3} fill="#f59e0b" opacity="0.5" />
        <circle cx="2" cy="20" r={3} fill="#f59e0b" opacity="0.5" />
        <circle cx="40" cy="-48" r={27} fill="#fef3c7" />
        <g id="owl-ears" style={{ transformOrigin: '41px -70px' }}>
          <path d="M 24 -70 L 30 -86 L 37 -68 Z" fill="#fef3c7" />
          <path d="M 47 -70 L 56 -84 L 58 -66 Z" fill="#fef3c7" />
        </g>
        <path d="M 22 -52 A 20 20 0 1 1 58 -48" stroke="#fbbf24" strokeWidth="3" fill="none" opacity="0.8" />
        <circle cx="46" cy="-52" r={5} fill="#1c1917" />
        <path d="M 62 -50 L 75 -46 L 61 -41 Z" fill="#f59e0b" />
        <path d="M 6 48 L 4 63 M 20 48 L 20 63" stroke="#d97706" strokeWidth="4" strokeLinecap="round" />
        <path d="M -2 63 L 10 63 M 14 63 L 27 63" stroke="#d97706" strokeWidth="3" strokeLinecap="round" />

        {/* Near wing: .wn remains the existing shoulder-level control. */}
        <g transform="translate(6, -20)">
          <g className="wing wn">
            <WingSegments prefix="wn" segments={NEAR_SEGMENTS} fill="#fcd34d" />
          </g>
        </g>
      </g>
    </g>
  );
}