export const SEGMENT_LAG_MS = Object.freeze([0, 32, 64, 96, 128]);
export const SEGMENT_GAIN = Object.freeze([0.22, 0.42, 0.64, 0.84, 1]);

export function sampleWingWave(ms, events, segmentIndex, extraLag = 0) {
  const index = Math.max(0, Math.min(SEGMENT_LAG_MS.length - 1, segmentIndex));
  const lag = SEGMENT_LAG_MS[index] + extraLag;
  const gain = SEGMENT_GAIN[index];

  return events.reduce((angle, event) => {
    const duration = Math.max(1, event.duration);
    const t = (ms - event.at - lag) / duration;
    if (t <= 0 || t >= 1) return angle;

    // One soft down/up flex pulse. The envelope makes the segment enter and
    // leave at zero rotation, so reverse scrubbing is continuous.
    const envelope = Math.sin(Math.PI * t);
    const wave = Math.sin(Math.PI * 2 * t);
    return angle + event.amplitude * gain * envelope * wave;
  }, 0);
}

export function isInRanges(ms, ranges) {
  return ranges.some(([start, end]) => ms >= start && ms < end);
}