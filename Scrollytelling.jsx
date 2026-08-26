import { useEffect, useRef } from 'react';
import { createTimeline, createScope, stagger, utils, svg } from 'animejs';
import Lenis from 'lenis';
import './scrollytelling.css';
import moonUrl from './assets/moon.png';

/**
 * QOZYD — cinematic scroll-driven narrative.
 *
 * ENGINE (v2 — rebuilt on proven patterns: darkroomengineering/lenis +
 * manual timeline seeking, the standard production scrollytelling setup):
 *
 * 1. FIXED CANVAS — a 2400vh .scroll-track provides scroll length while a
 *    position:fixed 100vh canvas stays locked to the screen. Nothing
 *    physically scrolls away; every visual change lives on the stage.
 * 2. EASED SCRUB — one master createTimeline() with ease:'inOutSine' and
 *    autoplay:false. Lenis feeds scroll progress every frame:
 *    tl.seek(tl.duration * progress). Still fully reversible and
 *    frame-accurate — easing only redistributes motion within each
 *    tween's own local window, it doesn't add time-based state, so
 *    scrubbing in either direction stays exact. If Lenis cannot
 *    initialize, a passive native scroll listener takes over with
 *    identical math.
 * 3. BEAT GRID — 8 chapters x 300vh. Chapters 1-4 & 7-8 have three 100vh
 *    beats (1000ms each); chapters 5 & 6 have four beats at 75vh (750ms).
 *    All 26 story beats live inside the 2400vh track.
 *    1ms of timeline == 0.1vh of scroll.
 * 4. MOBILE FOLLOW-CAM — landscape/desktop keep the authored full-stage
 *    viewBox untouched (pixel-identical output). Portrait viewports, where
 *    `slice` fitting crops ~74% of the scene width, drive the viewBox as a
 *    virtual camera: it eases onto the owl at take-off, tracks it through
 *    every chapter, and pulls back out for the QOZYD wordmark reveal.
 */

// Absolute beat anchors (ms). Every tween positions against this table so
// the master grid stays exact regardless of add() ordering.
const B = {
  c1b1: 0, c1b2: 1000, c1b3: 2000,
  c2b1: 3000, c2b2: 4000, c2b3: 5000,
  c3b1: 6000, c3b2: 7000, c3b3: 8000,
  c4b1: 9000, c4b2: 10000, c4b3: 11000,
  c5b1: 12000, c5b2: 12750, c5b3: 13500, c5b4: 14250,
  c6b1: 15000, c6b2: 15750, c6b3: 16500, c6b4: 17250,
  c7b1: 18000, c7b2: 19000, c7b3: 20000,
  c8b1: 21000, c8b2: 22000, c8b3: 23000,
};

export default function Scrollytelling() {
  const rootRef = useRef(null);
  const trackRef = useRef(null);
  const hudRef = useRef(null);
  const svgRef = useRef(null);

  useEffect(() => {
    if (!trackRef.current) return;

    let disposeScroll = null;
    let disposeCamWake = null;
    // Any engine failure becomes visible on the HUD instead of dying silently.
    const fail = (err) => {
      // eslint-disable-next-line no-console
      console.error('[QOZYD] engine failure:', err);
      if (hudRef.current) {
        hudRef.current.textContent = 'BUILD ERROR: ' + (err && err.message ? err.message : String(err));
      }
    };
    const scope = createScope({ root: rootRef }).add(() => {
      try {
      // ---- Scrub-safe poses at progress 0 ----
      utils.set('#moon-wrap', { translateX: 960, translateY: 430, scale: 3.2 });
      utils.set('#owl-flight', { translateX: 430, translateY: 498, scale: 1.06 });
      utils.set('.wf', { rotate: 38 }); // far wing folded
      utils.set('.wn', { rotate: 24 }); // near wing folded

      // Path-draw targets
      const netPaths = svg.createDrawable('#net-paths path');
      const arcPaths = svg.createDrawable('#meet-arcs path');
      const cobalt = svg.createDrawable('#cur-cobalt');
      const royal = svg.createDrawable('#cur-royal');
      const cyan = svg.createDrawable('#cur-cyan');
      const turquoise = svg.createDrawable('#cur-turq');

      // ---- MASTER TIMELINE · linear scrub driven by Lenis ----
      const tl = createTimeline({
        defaults: { ease: 'inOutSine', duration: 1000 },
        autoplay: false, // the scrollbar is the clock; we seek manually
      });

      // Diagnostic HUD (dev aid — remove together with .qozyd-hud)
      let driverName = 'native';

      /* ===== MOBILE FOLLOW CAMERA =====================================
       * The 16:9 stage is authored for landscape; `slice` fitting crops a
       * portrait phone down to ~26% of the scene width, so the owl spends
       * most of the journey off-frame. On portrait viewports ONLY, steer
       * the SVG's viewBox as a virtual camera: ease in with a gentle zoom
       * once the owl takes flight, track it scene-to-scene, then relax
       * back to the full frame for the QOZYD reveal. Landscape/desktop
       * never touches the attribute. */
      const STAGE_W = 1920;
      const STAGE_H = 1080;
      const svgEl = svgRef.current;
      const owlEl = svgEl ? svgEl.querySelector('#owl-flight') : null;
      const cam = { cx: STAGE_W / 2, cy: STAGE_H / 2, h: STAGE_H };
      const camTarget = { cx: STAGE_W / 2, cy: STAGE_H / 2, h: STAGE_H };
      let camRaf = 0;
      let camLast = performance.now();
      const CAM_FLIGHT_AT = B.c1b3 + 820; // owl fades in as the reveal pulls back
      const CAM_FINALE_AT = B.c8b3;       // wordmark reveal pulls back out
      const CAM_BLEND = 0.06;             // share of the timeline per blend
      const CAM_ZOOM = 0.42;              // extra magnification while tracking
      const CAM_SLACK = 28;               // overdraw tolerance at stage edges
      // QOZYD reveal row (moon-O + letters) spans x 564..1340, y ~341..460;
      // frame the whole row with breathing room so nothing is cropped.
      const CAM_WORDMARK_CX = 952;
      const CAM_WORDMARK_CY = 400;
      const CAM_WORDMARK_W = 880;
      const CAM_MAX_H = 2400;             // sanity ceiling for ultra-thin screens

      const viewportSize = () => ({
        w: document.documentElement.clientWidth || window.innerWidth,
        h: document.documentElement.clientHeight || window.innerHeight,
      });

      // Follow-cam is portrait-only; checked live so rotation Just Works.
      const camEnabled = () => {
        const vp = viewportSize();
        return vp.w > 0 && vp.h > 0 && vp.w / vp.h < 1;
      };

      // Map a screen-space point into stage coordinates via the live CTM
      // (works regardless of how Anime.js applied the owl's transforms).
      const stagePointFromScreen = (px, py) => {
        if (!svgEl) return null;
        const m = svgEl.getScreenCTM();
        if (!m) return null;
        const det = m.a * m.d - m.b * m.c;
        if (!det) return null;
        return {
          x: (m.d * px - m.c * py + (m.c * m.f - m.d * m.e)) / det,
          y: (-m.b * px + m.a * py + (m.b * m.e - m.a * m.f)) / det,
        };
      };

      // Live centre of the owl in stage coordinates.
      const owlStageCenter = () => {
        if (!owlEl) return null;
        const r = owlEl.getBoundingClientRect();
        if (!r.width && !r.height) return null;
        return stagePointFromScreen(r.left + r.width / 2, r.top + r.height / 2);
      };

      const smoothstep01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

      const updateCamTarget = (p) => {
        if (!camEnabled()) {
          camTarget.cx = STAGE_W / 2;
          camTarget.cy = STAGE_H / 2;
          camTarget.h = STAGE_H;
          return;
        }
        const total = tl.duration || 24000;
        const ms = p * total;
        // The finale span is capped so the pull-back completes exactly at
        // the end of the track (B.c8b3 -> end is only 10% of the timeline).
        const tFlight = smoothstep01((ms - CAM_FLIGHT_AT) / (total * CAM_BLEND));
        const tFinale = smoothstep01(
          (ms - CAM_FINALE_AT) / Math.min(total * CAM_BLEND, total - CAM_FINALE_AT)
        );

        // Follow point: hold the authored centre through Chapter 1 (moon +
        // close-up are composed around x=960), then ease onto the owl.
        let fx = STAGE_W / 2;
        let fy = STAGE_H / 2;
        const owl = owlStageCenter();
        if (owl) {
          fx += (owl.x - fx) * tFlight;
          fy += (owl.y - fy) * tFlight;
        }

        // Framing height: gentle tracking zoom while airborne. At the
        // finale, relax to whatever height fits the ENTIRE wordmark across
        // the narrow viewport — on phones that is wider than the authored
        // stage, which is safe because the void beyond the stage shares
        // the sky/body colour (#050811).
        const hTrack = STAGE_H / (1 + CAM_ZOOM * tFlight);
        let hFinale = STAGE_H;
        if (tFinale > 0) {
          const vp = viewportSize();
          hFinale = Math.min(CAM_MAX_H, CAM_WORDMARK_W / (vp.w / vp.h));
        }
        const h = hTrack + (Math.max(hTrack, hFinale) - hTrack) * tFinale;

        fx += (CAM_WORDMARK_CX - fx) * tFinale; // settle on the wordmark row
        fy += (CAM_WORDMARK_CY - fy) * tFinale;

        const vp = viewportSize();
        const halfW = (h * (vp.w / vp.h)) / 2;
        const halfH = h / 2;
        // Keep the window over the painted stage; once the window is taller
        // or wider than the stage itself, recentre so overdraw stays symmetrical.
        if (halfW * 2 >= STAGE_W) fx = STAGE_W / 2;
        else fx = Math.min(STAGE_W - halfW + CAM_SLACK, Math.max(halfW - CAM_SLACK, fx));
        if (halfH * 2 >= STAGE_H) fy = STAGE_H / 2;
        else fy = Math.min(STAGE_H - halfH + CAM_SLACK, Math.max(halfH - CAM_SLACK, fy));
        camTarget.cx = fx;
        camTarget.cy = fy;
        camTarget.h = h;
      };

      // Ease the live camera toward its target every frame; scrubbing in
      // either direction stays smooth, and beat-to-beat teleports (c6b3,
      // c8b1) read as intentional pans instead of hard cuts.
      const camTick = (now) => {
        const dt = Math.min(64, now - camLast) / 1000;
        camLast = now;
        const k = 1 - Math.exp(-dt * 6.5); // frame-rate independent easing
        cam.cx += (camTarget.cx - cam.cx) * k;
        cam.cy += (camTarget.cy - cam.cy) * k;
        cam.h += (camTarget.h - cam.h) * k;
        const drift =
          Math.abs(camTarget.cx - cam.cx) +
          Math.abs(camTarget.cy - cam.cy) +
          Math.abs(camTarget.h - cam.h);
        const homeDrift =
          Math.abs(cam.cx - STAGE_W / 2) +
          Math.abs(cam.cy - STAGE_H / 2) +
          Math.abs(cam.h - STAGE_H);
        if (!camEnabled() && drift < 0.05 && homeDrift < 0.05) {
          // Settled at the authored (desktop) framing with nothing to track —
          // stop scheduling frames instead of looping forever. A resize or
          // orientation change (handled below) wakes it back up.
          camRaf = 0;
          return;
        }
        const vp = viewportSize();
        const w = cam.h * (vp.w / vp.h);
        if (svgEl) {
          svgEl.setAttribute('viewBox',
            (cam.cx - w / 2).toFixed(2) + ' ' +
            (cam.cy - cam.h / 2).toFixed(2) + ' ' +
            w.toFixed(2) + ' ' + cam.h.toFixed(2));
        }
        camRaf = requestAnimationFrame(camTick);
      };

      // Resize/orientation changes can flip camEnabled() (e.g. rotating a
      // phone) while the tick loop is parked — wake it and re-derive the
      // target from the current scroll position so it doesn't miss the change.
      const wakeCamTick = () => {
        updateCamTarget(currentProgress); // re-derive target for the new viewport
        if (!camRaf) {
          camLast = performance.now();
          camRaf = requestAnimationFrame(camTick);
        }
      };
      window.addEventListener('resize', wakeCamTick);
      window.addEventListener('orientationchange', wakeCamTick);
      disposeCamWake = () => {
        window.removeEventListener('resize', wakeCamTick);
        window.removeEventListener('orientationchange', wakeCamTick);
      };

      // Deterministic playhead: one function owns every write.
      let currentProgress = 0;
      const seekToProgress = (p) => {
        const clamped = Math.min(1, Math.max(0, p));
        currentProgress = clamped;
        tl.seek(tl.duration * clamped);
        updateCamTarget(clamped);
        // Dev-only diagnostics — never runs (or renders) in a production build.
        if (import.meta.env.DEV && hudRef.current) {
          const trackH = trackRef.current ? Math.round(trackRef.current.offsetHeight) : 0;
          hudRef.current.textContent =
            driverName + ' · ' + (clamped * 100).toFixed(1) + '% · dur ' +
            Math.round(tl.duration) + 'ms · track ' + trackH + 'px · cam ' +
            (camEnabled() ? 'follow' : 'off');
        }
      };

      /* ================= CHAPTERS 1-8 · 26-BEAT CHOREOGRAPHY ================= */

      /* =============== CHAPTER 1 · THE MOON AND THE OWL =============== */
      // Beat 1 — glowing ivory moon, drifting clouds, staggered stars
      tl.add('#stars circle', {
        opacity: [0, 0.85], duration: 800,
        delay: stagger(30, { from: 'random' }),
      }, B.c1b1)
        .add('#clouds', { translateX: [-40, 60], duration: 1000 }, B.c1b1)
        .add('#moon-wrap', { translateY: [430, 402], duration: 500 }, B.c1b1)
        .add('#moon-wrap', { translateY: [402, 430], duration: 500 }, B.c1b1 + 500);

      // Beat 2 — camera pulls back: moon shrinks into an owl-iris reflection
      tl.add('#owl-closeup', { opacity: [0, 1], duration: 450 }, B.c1b2)
        .add('#clouds', { opacity: [1, 0.15], duration: 700 }, B.c1b2)
        .add('#moon-wrap', {
          translateX: [960, 1150], translateY: [430, 500], scale: [3.2, 0.3],
          duration: 1000,
        }, B.c1b2);

      // Beat 3 — blink; the eyelid closes, and behind it we're back on the
      // moon alone for a held beat before the camera pulls back to reveal
      // the real forest scene. Three distinct steps, not a single cut.
      tl.add('#iris-r', { scale: [1, 1.14], duration: 200 }, B.c1b3)
        .add('.lid-rot', { scaleY: [0, 1], duration: 240 }, B.c1b3 + 160)
        .add('#owl-closeup', { opacity: [1, 0], duration: 160 }, B.c1b3 + 400)
        // — back to the moon: held alone on screen, nothing else moving —
        .add('#moon-wrap', {
          translateX: [1150, 960], translateY: [500, 300], scale: [0.3, 0.85],
          duration: 320,
        }, B.c1b3 + 420)
        // (a quiet ~100ms pause lives here — the moon simply holds)
        // — pull back: the forest resolves around it, moon settles into the distant sky —
        .add('#canopy-scene', { opacity: [0, 1], duration: 300 }, B.c1b3 + 820)
        .add('#owl-flight', { opacity: [0, 1], duration: 240 }, B.c1b3 + 820)
        .add('#moon-wrap', {
          translateX: [960, 1330], translateY: [300, 220], scale: [0.85, 0.5],
          duration: 320,
        }, B.c1b3 + 820)
        .add('#canopy-scene', { scale: [1.07, 1], translateY: [-18, 0], duration: 480 }, B.c1b3 + 820);

      /* ========== CHAPTER 2 · THE FIRST FLIGHT — WEB DESIGN ========== */
      // Beat 1 — body lowers, wings part, the branch bends beneath
      tl.add('#owl-rotor', { translateY: [0, 16], duration: 400 }, B.c2b1)
        .add('.wf', { rotate: [38, 6], duration: 450 }, B.c2b1 + 80)
        .add('.wn', { rotate: [24, -4], duration: 450 }, B.c2b1 + 80)
        .add('#branch-a', { opacity: [1, 0], duration: 350 }, B.c2b1 + 150)
        .add('#branch-b', { opacity: [0, 1], duration: 350 }, B.c2b1 + 150)
        .add('#owl-rotor', { translateY: [16, 19], duration: 470 }, B.c2b1 + 530);

      // Beat 2 — push-off; foreground leaves sweep outward in parallax
      tl.add('#branch-a', { opacity: [0, 1], duration: 220 }, B.c2b2)
        .add('#branch-b', { opacity: [1, 0], duration: 220 }, B.c2b2)
        .add('#owl-flight', {
          translateX: [430, 880], translateY: [498, 290],
          scale: [1.06, 0.72], rotate: [0, -6], duration: 720,
        }, B.c2b2)
        .add('.wn', { rotate: [-4, -62], duration: 320 }, B.c2b2)
        .add('.wn', { rotate: [-62, 10], duration: 400 }, B.c2b2 + 320)
        .add('.wf', { rotate: [6, -54], duration: 320 }, B.c2b2 + 40)
        .add('.wf', { rotate: [-54, 16], duration: 400 }, B.c2b2 + 360)
        .add('#leafL', { translateX: [0, -560], duration: 650 }, B.c2b2 + 60)
        .add('#leafR', { translateX: [0, 560], duration: 650 }, B.c2b2 + 60)
        .add('#leafL', { opacity: [1, 0], duration: 160 }, B.c2b2 + 550)
        .add('#leafR', { opacity: [1, 0], duration: 160 }, B.c2b2 + 550);

      // Beat 3 — corridor glide through flat forest layers (one species each)
      tl.add('#row-1', { translateY: [0, 70], translateX: [0, 40], duration: 1000 }, B.c2b3)
        .add('#row-2', { translateY: [0, 150], translateX: [0, -55], duration: 1000 }, B.c2b3)
        .add('#row-3', { translateY: [0, 260], translateX: [0, 70], duration: 1000 }, B.c2b3)
        .add('#row-4', { translateY: [0, 400], translateX: [0, -80], duration: 1000 }, B.c2b3)
        .add('#row-5', { translateY: [0, 560], translateX: [0, 95], duration: 1000 }, B.c2b3)
        .add('#owl-flight', {
          translateX: [880, 960], translateY: [290, 430],
          scale: [0.72, 0.6], rotate: [-6, -3], duration: 1000,
        }, B.c2b3)
        .add('.wn', { rotate: [10, -28], duration: 500 }, B.c2b3)
        .add('.wf', { rotate: [16, -14], duration: 500 }, B.c2b3)
        .add('#owl-rotor', { translateY: [19, 8], duration: 500 }, B.c2b3)
        .add('#owl-rotor', { translateY: [8, 0], duration: 500 }, B.c2b3 + 500);

      /* ============ CHAPTER 3 · THE FIREFLY NETWORK — MARKETING ============ */
      // Beat 1 — a single firefly catches the owl's attention
      tl.add('#ff-1', { opacity: [0, 1], scale: [0.2, 1], duration: 300 }, B.c3b1)
        .add('#ff-1', { translateX: [0, 70], translateY: [0, -80], duration: 900 }, B.c3b1 + 100)
        .add('#owl-rotor', { rotate: [0, -8], duration: 450 }, B.c3b1 + 150);

      // Beat 2 — fireflies illuminate in a stagger; connection paths draw
      tl.add('#fireflies circle', {
        opacity: [0, 1], scale: [0.2, 1.15], duration: 600, delay: stagger(70),
      }, B.c3b2)
        .add(netPaths, { draw: '0 1', duration: 600, delay: stagger(80) }, B.c3b2 + 150);

      // Beat 3 — aerial three-quarter view; paths converge on the hollow
      tl.add('#canopy-scene', {
        scale: [1, 1.28], translateX: [0, -140], translateY: [0, 110],
        rotate: [0, -3], duration: 950,
      }, B.c3b3)
        .add('#wildlife', { opacity: [0, 0.38], duration: 500 }, B.c3b3 + 280)
        .add('#hollow-ring', { opacity: [0, 0.9], duration: 400 }, B.c3b3 + 380)
        .add('#hollow-ring', { scale: [1, 1.16], duration: 260 }, B.c3b3 + 560)
        .add('#hollow-ring', { scale: [1.16, 1], duration: 180 }, B.c3b3 + 820)
        .add('#firefly-network', { translateX: [0, 140], translateY: [0, -70], duration: 850 }, B.c3b3 + 130);

      /* ================ CHAPTER 4 · THE NEST — IMPLIED CARE ================ */
      // Beat 1 — following the final firefly signal toward the hollow
      tl.add('#ff-1', { translateX: [70, 560], translateY: [-80, -190], duration: 950 }, B.c4b1)
        .add('#owl-flight', {
          translateX: [960, 1250], translateY: [430, 295],
          scale: [0.6, 0.5], rotate: [-3, -10], duration: 950,
        }, B.c4b1)
        .add('#firefly-network', { opacity: [1, 0.25], duration: 550 }, B.c4b1 + 220);

      // Beat 2 — through the opening into the warm geometric interior
      tl.add('#canopy-scene', {
        scale: [1.28, 2.35], translateX: [-140, -340], translateY: [110, 240],
        opacity: [1, 0], duration: 880,
      }, B.c4b2)
        .add('#hollow-ring', { opacity: [0.9, 0], duration: 300 }, B.c4b2)
        .add('#interior', { scale: [0.93, 1], duration: 880 }, B.c4b2 + 120)
        .add('#interior', { opacity: [0, 1], duration: 520 }, B.c4b2 + 360)
        .add('#owl-flight', { opacity: [1, 0], duration: 130 }, B.c4b2 + 380);

      // Beat 3 — a nest with exactly three eggs; one strand is adjusted
      tl.add('#nest', { opacity: [0, 1], scale: [0.65, 1], duration: 460 }, B.c4b3)
        .add('#eggs .egg', {
          opacity: [0, 1], scale: [0.25, 1], duration: 420, delay: stagger(140),
        }, B.c4b3 + 260)
        .add('#owl-flight', { opacity: [0, 1], duration: 200 }, B.c4b3 + 300)
        .add('#owl-flight', {
          translateX: [1250, 1185], translateY: [295, 415],
          scale: [0.5, 0.56], duration: 520,
        }, B.c4b3 + 300)
        .add('.wn', { rotate: [-28, -72], duration: 300 }, B.c4b3 + 520)
        .add('#strand-rot', { rotate: [0, 9], duration: 240 }, B.c4b3 + 600)
        .add('#strand-rot', { rotate: [9, 0], duration: 220 }, B.c4b3 + 780)
        .add('.wn', { rotate: [-72, -28], duration: 220 }, B.c4b3 + 780);

      /* ===================== CHAPTER 5 · THE HUNT (4 x 75vh) ===================== */
      // Beat 1 — perched above the dark, fog-covered canopy; listening
      tl.add('#interior', { opacity: [1, 0], scale: [1, 1.07], duration: 480 }, B.c5b1)
        .add('#canopy-scene', { opacity: [0, 1], duration: 380 }, B.c5b1 + 140)
        .add('#canopy-scene', {
          scale: [2.35, 1], translateX: [-340, 0], translateY: [240, 0],
          rotate: [-3, 0], duration: 600,
        }, B.c5b1 + 140)
        .add('#owl-flight', {
          translateX: [1185, 300], translateY: [415, 470],
          scale: [0.56, 0.8], rotate: [-10, 0], duration: 620,
        }, B.c5b1 + 140)
        .add('.wn', { rotate: [-28, 26], duration: 480 }, B.c5b1 + 180)
        .add('.wf', { rotate: [-14, 40], duration: 480 }, B.c5b1 + 180)
        // settle onto the perch...
        .add('#owl-rotor', { rotate: [-8, 5], duration: 170 }, B.c5b1 + 430)
        // ...then listen: a small alert head-tilt and ear-perk once landed,
        // reading as the owl tuning into something out in the dark.
        .add('#owl-rotor', { rotate: [5, -4], duration: 100 }, B.c5b1 + 600)
        .add('#owl-rotor', { rotate: [-4, 6], duration: 120 }, B.c5b1 + 700)
        .add('#owl-ears', { rotate: [0, -8], scaleY: [1, 1.15], duration: 130 }, B.c5b1 + 590)
        .add('#owl-ears', { rotate: [-8, 4], scaleY: [1.15, 1.04], duration: 160 }, B.c5b1 + 720)
        .add('#fog', { opacity: [0, 1], duration: 540 }, B.c5b1 + 90)
        .add('#fband-1', { translateX: [0, -90], duration: 750 }, B.c5b1)
        .add('#fband-2', { translateX: [0, 70], duration: 750 }, B.c5b1)
        .add('#night-grade', { opacity: [0, 0.5], duration: 580 }, B.c5b1 + 100);

      // Beat 2 — a rat near the burrow; golden sound-rings travel to the owl
      tl.add('#rat', { opacity: [0, 1], duration: 140 }, B.c5b2)
        .add('#rat', { translateX: [0, -120], duration: 600 }, B.c5b2 + 60)
        .add('#rat', { translateY: [0, -7], duration: 300 }, B.c5b2 + 60)
        .add('#rat', { translateY: [-7, 0], duration: 300 }, B.c5b2 + 360)
        .add('.ring-w-1', {
          opacity: [0, 0.9], scale: [0.2, 0.7],
          translateX: [0, -20], translateY: [0, -70], duration: 230,
        }, B.c5b2 + 30)
        .add('.ring-w-1', {
          opacity: [0.9, 0], scale: [0.7, 1.15],
          translateX: [-20, -45], translateY: [-70, -185], duration: 230,
        }, B.c5b2 + 260)
        .add('.ring-w-2', {
          opacity: [0, 0.9], scale: [0.2, 0.7],
          translateX: [0, -26], translateY: [0, -90], duration: 230,
        }, B.c5b2 + 170)
        .add('.ring-w-2', {
          opacity: [0.9, 0], scale: [0.7, 1.2],
          translateX: [-26, -58], translateY: [-90, -250], duration: 230,
        }, B.c5b2 + 400)
        .add('.ring-w-3', {
          opacity: [0, 0.9], scale: [0.2, 0.75],
          translateX: [0, -32], translateY: [0, -105], duration: 230,
        }, B.c5b2 + 270)
        .add('.ring-w-3', {
          opacity: [0.9, 0], scale: [0.75, 1.25],
          translateX: [-32, -70], translateY: [-105, -315], duration: 230,
        }, B.c5b2 + 480)
        .add('#fband-1', { translateX: [-90, -170], duration: 750 }, B.c5b2);

      // Beat 3 — airborne swoop; fog recedes; owl, rat & burrow isolated
      tl.add('#owl-flight', {
        translateX: [300, 468], translateY: [470, 862],
        scale: [0.8, 0.52], rotate: [0, 26], duration: 700,
      }, B.c5b3)
        .add('.wn', { rotate: [26, 64], duration: 320 }, B.c5b3 + 40)
        .add('.wf', { rotate: [40, 70], duration: 320 }, B.c5b3 + 40)
        .add('#hunt-vignette', { opacity: [0, 1], duration: 560 }, B.c5b3 + 90)
        .add('#night-grade', { opacity: [0.5, 0.78], duration: 520 }, B.c5b3 + 90)
        .add('#fog', { opacity: [1, 0.22], duration: 520 }, B.c5b3 + 140)
        .add('#rat', { translateX: [-120, -112], duration: 300 }, B.c5b3 + 320);

      // Beat 4 — the rat reaches the opening first… and is caught anyway
      tl.add('#rat', { translateX: [-112, -155], duration: 240 }, B.c5b4)
        .add('#owl-flight', {
          translateX: [468, 448], translateY: [862, 876],
          rotate: [26, 16], duration: 240,
        }, B.c5b4 + 200)
        .add('#rat', { scale: [1, 0.62], translateY: [0, 16], duration: 240 }, B.c5b4 + 400)
        .add('#rat', { opacity: [1, 0.85], duration: 240 }, B.c5b4 + 400)
        .add('#hunt-vignette', { opacity: [1, 0.92], duration: 180 }, B.c5b4 + 430)
        .add('#hunt-vignette', { opacity: [0.92, 1], duration: 140 }, B.c5b4 + 610);

      /* ============ CHAPTER 6 · BELOW THE SURFACE — TRADEMARKING (4 x 75vh) ============ */
      // Beat 1 — release (new coat), wings folded, into the burrow mouth
      tl.add('#rat .fur', { fill: ['#94a3b8', '#d9b98c'], duration: 300 }, B.c6b1)
        .add('#rat', { translateX: [-155, 40], duration: 560 }, B.c6b1 + 100)
        .add('#rat', { translateY: [16, -26], duration: 280 }, B.c6b1 + 100)
        .add('#rat', { translateY: [-26, 16], duration: 280 }, B.c6b1 + 380)
        .add('#rat', { opacity: [0.85, 0], duration: 170 }, B.c6b1 + 550)
        .add('#owl-flight', {
          translateX: [448, 430], translateY: [876, 892],
          scale: [0.52, 0.34], rotate: [16, 0], duration: 620,
        }, B.c6b1 + 60)
        .add('.wn', { rotate: [64, 34], duration: 380 }, B.c6b1 + 120)
        .add('.wf', { rotate: [70, 44], duration: 380 }, B.c6b1 + 120)
        .add('#owl-flight', { opacity: [1, 0], duration: 180 }, B.c6b1 + 540);

      // Beat 2 — a dark aperture swallows the frame; descent behind the owl
      tl.add('#aperture', { opacity: [0, 1], duration: 170 }, B.c6b2)
        .add('#aperture-hole', { r: [600, 0], duration: 370 }, B.c6b2 + 30)
        .add('#canopy-scene', { opacity: [1, 0], duration: 60 }, B.c6b2 + 420)
        .add('#night-grade', { opacity: [0.78, 0], duration: 60 }, B.c6b2 + 420)
        .add('#hunt-vignette', { opacity: [1, 0], duration: 60 }, B.c6b2 + 420)
        .add('#fog', { opacity: [0.22, 0], duration: 60 }, B.c6b2 + 420)
        .add('#moon-wrap', { opacity: [1, 0], duration: 60 }, B.c6b2 + 420)
        .add('#underground', { opacity: [0, 1], duration: 190 }, B.c6b2 + 440)
        .add('#aperture-hole', { r: [0, 900], duration: 240 }, B.c6b2 + 450)
        .add('#aperture', { opacity: [1, 0], duration: 200 }, B.c6b2 + 470)
        .add('#underground', { scale: [1.045, 1], translateY: [36, 0], duration: 750 }, B.c6b2);

      // Beat 3 — aubergine root boundaries; lime fungi light the edges
      tl.add('#owl-flight', {
        translateX: [430, 960], translateY: [892, -130],
        scale: [0.34, 0.52], rotate: [0, 0], duration: 10,
      }, B.c6b3)
        .add('#owl-flight', { opacity: [0, 1], duration: 120 }, B.c6b3 + 12)
        .add('#owl-flight', { translateY: [-130, 540], duration: 690 }, B.c6b3 + 12)
        .add('.wn', { rotate: [34, -12], duration: 280 }, B.c6b3 + 120)
        .add('.wf', { rotate: [44, -6], duration: 280 }, B.c6b3 + 120)
        .add('.fun-cap', { opacity: [0.15, 1], duration: 260, delay: stagger(70) }, B.c6b3)
        .add('.fun-cap', { opacity: [1, 0.15], duration: 260, delay: stagger(70) }, B.c6b3 + 260)
        .add('.lit', { opacity: [0, 0.5], duration: 260, delay: stagger(70) }, B.c6b3)
        .add('.lit', { opacity: [0.5, 0], duration: 140, delay: stagger(70) }, B.c6b3 + 340)
        .add('#owl-flight', { translateX: [960, 1040], duration: 190 }, B.c6b3 + 560);

      // Beat 4 — the tunnel opens onto a thin blue current
      tl.add('#owl-flight', {
        translateX: [1040, 1150], translateY: [540, 690], duration: 750,
      }, B.c6b4)
        .add(cobalt, { draw: ['0 0', '0 0.5'], duration: 700 }, B.c6b4 + 30)
        .add('.bug', { opacity: [0, 0.95], duration: 300, delay: stagger(40) }, B.c6b4 + 180)
        .add('.fun-cap', { opacity: [0.15, 0.55], duration: 340, delay: stagger(90) }, B.c6b4);

      /* ================ CHAPTER 7 · THE GROWING CURRENT ================ */
      // Beat 1 — following the original thin cobalt trickle
      tl.add('#owl-flight', {
        translateX: [1150, 1420], translateY: [690, 715], duration: 980,
      }, B.c7b1)
        .add(cobalt, { draw: ['0 0.5', '0 0.66'], duration: 900 }, B.c7b1 + 50)
        .add('.bug', { translateX: [0, 22], duration: 980 }, B.c7b1)
        .add('.fun-cap', { opacity: [0.55, 0.3], duration: 490 }, B.c7b1)
        .add('.fun-cap', { opacity: [0.3, 0.55], duration: 490 }, B.c7b1 + 490);

      // Beat 2 — a royal tributary joins; a cyan current connects downstream
      tl.add(royal, { draw: '0 1', duration: 430 }, B.c7b2)
        .add('#cur-cobalt', { strokeWidth: [5, 9], duration: 240 }, B.c7b2 + 260)
        .add(cyan, { draw: '0 1', duration: 330 }, B.c7b2 + 500)
        .add('#cur-cobalt', { strokeWidth: [9, 13], duration: 200 }, B.c7b2 + 700)
        .add('#owl-flight', {
          translateX: [1420, 1660], translateY: [715, 700], duration: 980,
        }, B.c7b2)
        .add('.bug', { translateX: [22, 0], duration: 980 }, B.c7b2);

      // Beat 3 — pale turquoise joins; one broad luminous stream seeks the surface
      tl.add(turquoise, { draw: '0 1', duration: 380 }, B.c7b3)
        .add('#cur-cobalt', { strokeWidth: [13, 17], duration: 220 }, B.c7b3 + 360)
        .add('#stream-glow', { opacity: [0, 0.55], duration: 520 }, B.c7b3 + 120)
        .add('#shaft-light', { opacity: [0, 0.24], duration: 600 }, B.c7b3 + 180)
        .add('#underground', { translateY: [0, -42], duration: 980 }, B.c7b3)
        .add('#owl-flight', {
          translateX: [1660, 1815], translateY: [700, 672],
          rotate: [0, 6], duration: 960,
        }, B.c7b3)
        .add('.bug', { translateX: [0, -18], duration: 980 }, B.c7b3);

      /* ========== CHAPTER 8 · THE POND AND THE QOZYD REVEAL ========== */
      // Beat 1 — the broad stream carries us out into a pond clearing
      tl.add('#underground', { opacity: [1, 0], duration: 500 }, B.c8b1)
        .add('#underground', { translateY: [-42, -130], duration: 500 }, B.c8b1)
        .add('#pond', { scale: [1.03, 1], duration: 1000 }, B.c8b1)
        .add('#pond', { opacity: [0, 1], duration: 550 }, B.c8b1 + 200)
        .add('#moon-wrap', { opacity: [0, 1], duration: 300 }, B.c8b1 + 350)
        .add('#owl-flight', {
          translateX: [1815, 2060], translateY: [672, 700],
          scale: [0.5, 0.42], rotate: [6, 0], duration: 10,
        }, B.c8b1)
        .add('#owl-flight', {
          translateX: [2060, 1180], translateY: [700, 640],
          scale: [0.42, 0.6], rotate: [0, -5], duration: 820,
        }, B.c8b1 + 160)
        .add('.wn', { rotate: [34, -30], duration: 400 }, B.c8b1 + 200)
        .add('.wf', { rotate: [44, -16], duration: 400 }, B.c8b1 + 200);

      // Beat 2 — low glide over glowing ripples; two worlds meet; landing
      tl.add('#ripple-w-0', {
        opacity: [0, 0.85], scale: [0.35, 0.85], duration: 360,
      }, B.c8b2)
        .add('#ripple-w-0', { opacity: [0.85, 0], scale: [0.85, 1.3], duration: 360 }, B.c8b2 + 360)
        .add('#ripple-w-1', { opacity: [0, 0.85], scale: [0.35, 0.85], duration: 360 }, B.c8b2 + 140)
        .add('#ripple-w-1', { opacity: [0.85, 0], scale: [0.85, 1.3], duration: 360 }, B.c8b2 + 500)
        .add('#ripple-w-2', { opacity: [0, 0.85], scale: [0.35, 0.85], duration: 360 }, B.c8b2 + 280)
        .add('#ripple-w-2', { opacity: [0.85, 0], scale: [0.85, 1.3], duration: 360 }, B.c8b2 + 640)
        .add('#pond-flies', {
          opacity: [0, 1], translateX: [0, 190], translateY: [0, -80],
          duration: 700,
        }, B.c8b2 + 100)
        .add('#pond-bugs', {
          opacity: [0, 1], translateX: [0, -230], translateY: [0, -95],
          duration: 700,
        }, B.c8b2 + 150)
        .add(arcPaths, { draw: '0 1', duration: 420, delay: stagger(120) }, B.c8b2 + 380)
        .add('#owl-flight', {
          translateX: [1180, 1360], translateY: [640, 556],
          rotate: [-5, 0], scale: [0.6, 0.62], duration: 550,
        }, B.c8b2 + 250)
        .add('.wn', { rotate: [-30, -46], duration: 200 }, B.c8b2 + 250)
        .add('.wn', { rotate: [-46, 30], duration: 250 }, B.c8b2 + 480)
        .add('.wf', { rotate: [-16, 42], duration: 250 }, B.c8b2 + 480)
        .add('#pond-stars', { opacity: [0.45, 0.75], duration: 1000 }, B.c8b2);

      // Beat 3 — Q 🌕 Z Y D across the sky · "Start the journey."
      // The moon IS the "O" — it lives in the reveal layer, above the pond
      // sky rect, so the full photo moon shows (not just the halo ring).
      tl.add('#letters g', {
        opacity: [0, 1], translateY: [46, 0], duration: 480, delay: stagger(120),
      }, B.c8b3 + 100)
        .add('#moon-o', { opacity: [0, 1], duration: 300 }, B.c8b3 + 150)
        .add('#moon-o', {
          translateX: [1330, 790], translateY: [220, 400],
          scale: [0.5, 0.4667], duration: 650,
        }, B.c8b3 + 250)
        .add('#halo', { opacity: [0, 0.55], scale: [0.6, 1], duration: 350 }, B.c8b3 + 650)
        .add('.cta-text', { opacity: [0, 1], translateY: [28, 0], duration: 450 }, B.c8b3 + 500);

      /* ---- SCROLL DRIVER · Lenis(autoRaf) → progress → seek ---- */
      // Respect prefers-reduced-motion: Lenis adds its own momentum/inertia
      // on top of the user's scroll input, which is exactly the kind of
      // autonomous motion that setting exists to suppress. The story is
      // still 1:1 scroll-linked either way — this only removes the extra
      // smoothing layer, falling back to the same native driver used when
      // Lenis is unavailable.
      const prefersReducedMotion =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      const useNativeDriver = () => {
        const onNativeScroll = () => {
          const el = trackRef.current;
          if (!el) return;
          const total = el.offsetHeight - window.innerHeight;
          if (total <= 0) return; // division-by-zero layout guard
          seekToProgress(-el.getBoundingClientRect().top / total);
        };
        window.addEventListener('scroll', onNativeScroll, { passive: true });
        disposeScroll = () => window.removeEventListener('scroll', onNativeScroll);
        driverName = 'native';
      };

      if (prefersReducedMotion) {
        useNativeDriver();
      } else {
        try {
          const lenis = new Lenis({ autoRaf: true });
          lenis.on('scroll', (e) => seekToProgress(e.progress));
          disposeScroll = () => lenis.destroy();
          driverName = 'lenis';
        } catch {
          // Native fallback — identical math, no smoothing.
          useNativeDriver();
        }
      }
      camRaf = requestAnimationFrame(camTick);
      seekToProgress(0); // deterministic first frame (also paints the HUD)
      } catch (err) {
        fail(err);
      }
    });

    return () => {
      if (disposeScroll) disposeScroll();
      if (disposeCamWake) disposeCamWake();
      if (camRaf) cancelAnimationFrame(camRaf);
      scope.revert();
    };
  }, []);

  const replay = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  return (
      <div className="scroll-track" ref={trackRef}>
        <div ref={rootRef}>
          <div className="viewport-canvas">
            <svg
              ref={svgRef}
              className="story-svg"
              viewBox="0 0 1920 1080"
              preserveAspectRatio="xMidYMid slice"
              role="img"
              aria-label="QOZYD — an owl's journey from moonlight to brand reveal"
            >
              <defs>
                <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
                  <feGaussianBlur stdDeviation="10" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
                <radialGradient id="moon-gradient" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="70%" stopColor="#fefce8" />
                  <stop offset="100%" stopColor="#fef08a" />
                </radialGradient>
                <radialGradient id="warm-interior" cx="50%" cy="42%" r="65%">
                  <stop offset="0%" stopColor="#a16207" />
                  <stop offset="45%" stopColor="#713f12" />
                  <stop offset="100%" stopColor="#1c1410" />
                </radialGradient>
                <radialGradient id="pond-gradient" cx="50%" cy="38%" r="70%">
                  <stop offset="0%" stopColor="#155e75" />
                  <stop offset="55%" stopColor="#083344" />
                  <stop offset="100%" stopColor="#020617" />
                </radialGradient>
                <linearGradient id="fog-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#94a3b8" stopOpacity="0" />
                  <stop offset="50%" stopColor="#94a3b8" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#94a3b8" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="shaft-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#e0f2fe" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#e0f2fe" stopOpacity="0" />
                </linearGradient>
                <radialGradient id="hunt-vignette-gradient" cx="24%" cy="83%" r="85%">
                  <stop offset="0%" stopColor="#010409" stopOpacity="0" />
                  <stop offset="42%" stopColor="#010409" stopOpacity="0" />
                  <stop offset="100%" stopColor="#010409" stopOpacity="0.97" />
                </radialGradient>
                <radialGradient id="global-vignette-gradient" cx="50%" cy="50%" r="72%">
                  <stop offset="0%" stopColor="#020617" stopOpacity="0" />
                  <stop offset="62%" stopColor="#020617" stopOpacity="0" />
                  <stop offset="100%" stopColor="#020617" stopOpacity="0.8" />
                </radialGradient>
                <mask id="aperture-mask">
                  <rect x="0" y="0" width="1920" height="1080" fill="#fff" />
                  <circle id="aperture-hole" cx="430" cy="925" r="600" fill="#000" />
                </mask>
              </defs>

              {/* ===== SKY · stars · clouds ===== */}
              <rect x="0" y="0" width="1920" height="1080" fill="#050811" />
              <g id="stars">
                {[[140, 120, 2], [320, 80, 1.4], [520, 180, 1.8], [700, 90, 1.2],
                  [880, 150, 2.4], [1060, 60, 1.5], [1220, 170, 2], [1400, 110, 1.3],
                  [1580, 200, 2.2], [1760, 90, 1.6], [240, 320, 1.5], [1650, 340, 1.8],
                  [90, 420, 1.3], [1830, 430, 2], [600, 300, 1.2], [1340, 300, 1.6]]
                  .map(([cx, cy, r], i) => (
                    <circle key={i} cx={cx} cy={cy} r={r} fill="#fff" opacity="0" />
                  ))}
              </g>
              <g id="clouds">
                <g opacity="0.12">
                  <ellipse cx="700" cy="300" rx="185" ry="40" fill="#cbd5e1" />
                  <ellipse cx="810" cy="322" rx="120" ry="28" fill="#cbd5e1" />
                </g>
                <g opacity="0.1">
                  <ellipse cx="1240" cy="235" rx="160" ry="34" fill="#cbd5e1" />
                  <ellipse cx="1130" cy="256" rx="100" ry="24" fill="#cbd5e1" />
                </g>
                <g opacity="0.08"><ellipse cx="985" cy="430" rx="210" ry="42" fill="#cbd5e1" /></g>
              </g>

              {/* THE MOON — Chapter 1 hero, Chapter 8 letter “O”. One element, one identity. */}
              <g id="moon-wrap">
                {/* soft halo keeps the luminous rim behind the photo moon */}
                <circle fill="url(#moon-gradient)" filter="url(#glow)" r="140" opacity="0.5" />
                {/* real moon photo (RGBA — transparent corners, disc ~245px → radius ≈ 120) */}
                <image id="moon" href={moonUrl} x="-122.5" y="-122.2" width="245" height="244.4" />
              </g>

              {/* ===== CHAPTER 1 · CLOSE-UP FACE (abstract white & gold) ===== */}
              <g id="owl-closeup" opacity="0">
                <path d="M 960 60 C 1330 90 1560 320 1540 620 C 1520 900 1260 1050 960 1050 C 660 1050 400 900 380 620 C 360 320 590 90 960 60 Z" fill="#fef3c7" />
                <path d="M 480 300 q 120 -60 240 -20 M 1210 280 q 120 -30 230 30 M 430 700 q 90 90 210 110 M 1290 720 q 100 80 220 60" stroke="#f59e0b" strokeWidth="6" fill="none" opacity="0.22" strokeLinecap="round" />
                <g id="iris-l">
                  <circle cx="760" cy="505" r="150" fill="#fbbf24" />
                  <circle cx="760" cy="505" r="112" fill="#fde68a" />
                  <circle cx="760" cy="505" r="56" fill="#17130f" />
                  <circle cx="741" cy="486" r="14" fill="#fffbeb" opacity="0.9" />
                </g>
                <g id="iris-r">
                  <circle cx="1150" cy="505" r="150" fill="#fbbf24" />
                  <circle cx="1150" cy="505" r="112" fill="#fde68a" />
                  <circle cx="1150" cy="505" r="56" fill="#17130f" />
                  <circle cx="1131" cy="486" r="14" fill="#fffbeb" opacity="0.9" />
                </g>
                <g transform="translate(760, 355)">
                  <g className="lid-rot"><path d="M -158 0 H 158 V 210 Q 0 305 -158 210 Z" fill="#d97706" /></g>
                </g>
                <g transform="translate(1150, 355)">
                  <g className="lid-rot"><path d="M -158 0 H 158 V 210 Q 0 305 -158 210 Z" fill="#d97706" /></g>
                </g>
              </g>

              {/* ===== ABOVE-WORLD · flat forest corridor (far → near, one species per layer) ===== */}
              <g id="canopy-scene" opacity="0">
                <g id="row-1" fill="#1c2742">{/* distant pines */}
                  <path d="M -120 640 L -10 512 L 100 640 Z M -60 560 L -10 488 L 40 560 Z" />
                  <path d="M 180 640 L 300 500 L 420 640 Z M 245 556 L 300 478 L 355 556 Z" />
                  <path d="M 520 640 L 620 528 L 720 640 Z M 573 566 L 620 496 L 667 566 Z" />
                  <path d="M 850 640 L 975 492 L 1100 640 Z M 918 548 L 975 468 L 1032 548 Z" />
                  <path d="M 1230 640 L 1330 524 L 1430 640 Z M 1282 568 L 1330 494 L 1378 568 Z" />
                  <path d="M 1540 640 L 1670 496 L 1800 640 Z M 1610 552 L 1670 470 L 1730 552 Z" />
                  <path d="M 1880 640 L 1980 528 L 2080 640 Z M 1932 566 L 1980 494 L 2028 566 Z" />
                </g>
                <g id="row-2" fill="#16203a">{/* birches */}
                  <rect x="40" y="600" width="16" height="140" /><ellipse cx="48" cy="588" rx="58" ry="42" />
                  <rect x="300" y="585" width="14" height="155" /><ellipse cx="307" cy="572" rx="52" ry="38" />
                  <rect x="560" y="605" width="17" height="135" /><ellipse cx="568" cy="592" rx="60" ry="44" />
                  <rect x="830" y="590" width="14" height="150" /><ellipse cx="837" cy="578" rx="54" ry="40" />
                  <rect x="1110" y="600" width="16" height="140" /><ellipse cx="1118" cy="588" rx="58" ry="42" />
                  <rect x="1390" y="585" width="15" height="155" /><ellipse cx="1397" cy="572" rx="53" ry="39" />
                  <rect x="1660" y="602" width="17" height="138" /><ellipse cx="1668" cy="590" rx="59" ry="43" />
                  <rect x="1900" y="592" width="14" height="148" /><ellipse cx="1907" cy="580" rx="52" ry="38" />
                </g>
                <g id="row-3" fill="#101a30">{/* oaks */}
                  <rect x="120" y="710" width="26" height="120" />
                  <circle cx="133" cy="692" r="52" /><circle cx="178" cy="706" r="42" /><circle cx="92" cy="708" r="40" />
                  <rect x="480" y="700" width="28" height="130" />
                  <circle cx="494" cy="682" r="56" /><circle cx="544" cy="698" r="44" /><circle cx="448" cy="700" r="42" />
                  <rect x="900" y="712" width="25" height="118" />
                  <circle cx="912" cy="694" r="50" /><circle cx="956" cy="708" r="40" /><circle cx="872" cy="710" r="39" />
                  <rect x="1320" y="702" width="27" height="128" />
                  <circle cx="1334" cy="684" r="54" /><circle cx="1382" cy="700" r="43" /><circle cx="1290" cy="702" r="41" />
                  <rect x="1720" y="710" width="26" height="120" />
                  <circle cx="1733" cy="692" r="51" /><circle cx="1778" cy="706" r="41" /><circle cx="1690" cy="708" r="40" />
                </g>
                <g id="row-4" fill="#0a1226">{/* slender aspens */}
                  {[140, 330, 540, 760, 980, 1190, 1400, 1610, 1820].map((x, i) => (
                    <g key={i}>
                      <rect x={x} y={730} width="10" height="190" />
                      <ellipse cx={x + 5} cy={722} rx={26} ry={20} />
                    </g>
                  ))}
                </g>
                <g id="row-5" fill="#050a18">{/* near giants + a dead snag */}
                  <circle cx="60" cy="1010" r="120" /><circle cx="300" cy="1040" r="100" />
                  <rect x="520" y="880" width="34" height="200" /><circle cx="537" cy="862" r="74" />
                  <circle cx="820" cy="1050" r="110" />
                  <rect x="1080" y="900" width="30" height="180" /><circle cx="1095" cy="884" r="66" />
                  <circle cx="1360" cy="1040" r="105" />
                  <path d="M 1640 1080 L 1650 900 L 1600 840 M 1650 940 L 1710 900 M 1650 980 L 1596 960" stroke="#050a18" strokeWidth="18" fill="none" strokeLinecap="round" />
                  <circle cx="1860" cy="1055" r="115" />
                </g>
                <rect x="-100" y="1020" width="2120" height="120" fill="#030711" />

                {/* dim secondary silhouettes — deer & fox (Chapter 3) */}
                <g id="wildlife" opacity="0" fill="#0d1626">
                  <path d="M 250 950 q 10 -34 44 -36 q 36 -2 52 18 l 8 18 h -96 Z M 336 932 q 4 -26 18 -34 l 6 -22 8 20 q 14 8 14 30 Z" />
                  <path d="M 342 876 l -6 -26 m 6 26 l 10 -24 M 350 874 l -14 -22 m 14 22 l 16 -20" stroke="#0d1626" strokeWidth="5" fill="none" strokeLinecap="round" />
                  <path d="M 480 962 q 6 -22 30 -24 q 26 -2 34 14 q 22 2 34 -12 l -6 26 q -12 12 -30 10 l -4 12 h -18 l -2 -10 h -22 l -4 10 h -16 Z" />
                </g>
                {/* hollow tree (Chapters 3–4) */}
                <g id="hollow-tree">
                  <path d="M 1596 1080 L 1614 430 Q 1682 384 1750 430 L 1768 1080 Z" fill="#0b1322" />
                  <path d="M 1636 1080 V 560 M 1726 1080 V 540" stroke="#060b18" strokeWidth="8" />
                  <ellipse id="hollow-hole" cx="1682" cy="565" rx="92" ry="108" fill="#010409" />
                  <ellipse id="hollow-ring" cx="1682" cy="565" rx="92" ry="108" fill="none" stroke="#f59e0b" strokeWidth="7" filter="url(#glow)" opacity="0" />
                </g>
                {/* burrow mound (Chapters 5–6) */}
                <g id="burrow">
                  <path d="M 330 1010 Q 430 906 530 1010 Z" fill="#0a1120" />
                  <circle cx="430" cy="968" r="42" fill="#000208" />
                  <ellipse cx="430" cy="972" rx="52" ry="14" fill="none" stroke="#1e293b" strokeWidth="5" />
                </g>
                {/* perch branch — straight & bent twins cross-fade for the bend */}
                <g id="perch-group">
                  <path id="branch-a" d="M -60 540 Q 350 552 780 588" stroke="#241a14" strokeWidth="24" fill="none" strokeLinecap="round" />
                  <path id="branch-b" d="M -60 540 Q 350 572 780 618" stroke="#241a14" strokeWidth="24" fill="none" strokeLinecap="round" opacity="0" />
                  <path d="M 240 552 q 44 26 96 30" stroke="#241a14" strokeWidth="10" fill="none" strokeLinecap="round" />
                </g>
                {/* foreground leaves swept away at launch (Chapter 2) */}
                <g id="leafL" opacity="1">
                  <ellipse cx="40" cy="920" rx="150" ry="56" fill="#14532d" transform="rotate(-32 40 920)" />
                  <ellipse cx="-10" cy="1040" rx="170" ry="60" fill="#166534" transform="rotate(-18 -10 1040)" />
                  <ellipse cx="150" cy="1030" rx="120" ry="44" fill="#15803d" transform="rotate(-40 150 1030)" />
                </g>
                <g id="leafR" opacity="1">
                  <ellipse cx="1870" cy="70" rx="150" ry="52" fill="#14532d" transform="rotate(24 1870 70)" />
                  <ellipse cx="1790" cy="20" rx="110" ry="40" fill="#166534" transform="rotate(40 1790 20)" />
                </g>
                {/* darkness grade raised during the hunt */}
                <rect id="night-grade" x="0" y="0" width="1920" height="1080" fill="#010409" opacity="0" />
              </g>

              {/* ===== CHAPTER 3 · FIREFLY NETWORK ===== */}
              <circle id="ff-1" cx="1120" cy="620" r="6" fill="#fde047" filter="url(#glow)" opacity="0" />
              {/* net-paths + fireflies share one wrapper so the connection
                  lines travel and fade together with the dots that drew
                  them, instead of staying stranded at their original spot. */}
              <g id="firefly-network">
                <g id="net-paths" fill="none" stroke="#fde047" strokeWidth="2" opacity="0.85">
                  <path d="M 880 560 Q 945 520 1010 500" />
                  <path d="M 1010 500 Q 1095 515 1180 540" />
                  <path d="M 1180 540 Q 1225 590 1260 640" />
                  <path d="M 960 660 Q 985 585 1010 500" />
                </g>
                <g id="fireflies" filter="url(#glow)">
                  {[[880, 560], [1010, 500], [1180, 540], [1260, 640],
                    [960, 660], [820, 640], [1330, 580], [1080, 460]].map(([cx, cy], i) => (
                      <circle key={i} cx={cx} cy={cy} r={5} fill="#fde047" opacity="0" />
                    ))}
                </g>
              </g>

              {/* fog bands + hunt spotlight vignette (Chapter 5) */}
              <g id="fog" opacity="0">
                <g id="fband-1"><rect x="-200" y="660" width="2320" height="150" fill="url(#fog-gradient)" /></g>
                <g id="fband-2"><rect x="-200" y="800" width="2320" height="170" fill="url(#fog-gradient)" /></g>
                <rect x="-200" y="930" width="2320" height="150" fill="url(#fog-gradient)" opacity="0.8" />
              </g>
              <rect id="hunt-vignette" x="0" y="0" width="1920" height="1080" fill="url(#hunt-vignette-gradient)" opacity="0" />

              {/* ===== CHAPTER 4 · WARM GEOMETRIC INTERIOR ===== */}
              <g id="interior" opacity="0">
                <circle cx="960" cy="560" r="640" fill="url(#warm-interior)" />
                <polygon points="960,560 520,240 700,120" fill="#78350f" opacity="0.14" />
                <polygon points="960,560 1400,240 1220,120" fill="#78350f" opacity="0.12" />
                <polygon points="960,560 420,760 520,960" fill="#78350f" opacity="0.1" />
                <polygon points="960,560 1500,760 1400,960" fill="#78350f" opacity="0.12" />
                <polygon points="960,560 860,60 1060,60" fill="#78350f" opacity="0.08" />
                <ellipse cx="960" cy="118" rx="170" ry="62" fill="#fde68a" filter="url(#glow)" opacity="0.9" />
                <polygon points="840,150 1080,150 1220,620 700,620" fill="#fde68a" opacity="0.1" />
                {/* the nest — EXACTLY three eggs */}
                <g id="nest">
                  <ellipse cx="960" cy="782" rx="215" ry="92" fill="#5c3310" />
                  <ellipse cx="960" cy="776" rx="182" ry="72" fill="#3c2008" />
                  <path d="M 770 780 q 190 74 380 0" stroke="#92400e" strokeWidth="8" fill="none" strokeLinecap="round" />
                  <path d="M 790 812 q 170 52 340 0" stroke="#b45309" strokeWidth="7" fill="none" strokeLinecap="round" opacity="0.8" />
                  <path d="M 800 748 q 160 -44 320 0" stroke="#92400e" strokeWidth="7" fill="none" strokeLinecap="round" opacity="0.85" />
                  <g transform="translate(960, 780)">
                    <g id="strand-rot">
                      <path d="M -150 -30 Q 0 42 155 -22" stroke="#d97706" strokeWidth="10" fill="none" strokeLinecap="round" />
                    </g>
                  </g>
                  <g id="eggs" transform="translate(960, 772)">
                    <g transform="translate(-72, 6) rotate(-8)">
                      <ellipse className="egg" rx="33" ry="43" fill="#fffbeb" opacity="0" />
                    </g>
                    <g transform="translate(0, -4)">
                      <ellipse className="egg" rx="34" ry="45" fill="#fef3c7" opacity="0" />
                    </g>
                    <g transform="translate(72, 8) rotate(8)">
                      <ellipse className="egg" rx="32" ry="42" fill="#fde68a" opacity="0" />
                    </g>
                  </g>
                </g>
              </g>

              {/* ===== CHAPTERS 6–7 · BELOW THE SURFACE ===== */}
              <g id="underground" opacity="0">
                <rect x="-100" y="-200" width="2120" height="1480" fill="#0b0716" />
                {/* interlocking aubergine roots — calm natural boundaries */}
                <g stroke="#472049" fill="none" strokeLinecap="round">
                  <path d="M 800 -60 C 760 140 850 300 800 460 C 770 560 820 620 860 660" strokeWidth="34" />
                  <path d="M 1120 -60 C 1160 150 1070 310 1125 470 C 1160 570 1110 630 1070 660" strokeWidth="34" />
                  <path d="M -80 600 C 300 520 700 600 1100 560 C 1450 528 1750 600 2010 560" strokeWidth="40" />
                  <path d="M -80 980 C 350 1030 800 950 1200 1000 C 1550 1040 1800 980 2010 1010" strokeWidth="40" />
                  <path d="M 640 640 L 700 940" strokeWidth="22" />
                  <path d="M 1300 600 L 1350 960" strokeWidth="22" />
                  <path d="M 860 660 Q 960 700 1070 660" strokeWidth="18" />
                </g>
                {/* lime-lit root edges, pulsed by the fungi */}
                <g stroke="#a3e635" fill="none" strokeLinecap="round">
                  <path className="lit" d="M 800 -60 C 760 140 850 300 800 460" strokeWidth="34" opacity="0" />
                  <path className="lit" d="M 1120 -60 C 1160 150 1070 310 1125 470" strokeWidth="34" opacity="0" />
                  <path className="lit" d="M -80 600 C 300 520 700 600 1100 560" strokeWidth="40" opacity="0" />
                  <path className="lit" d="M 1200 1000 C 1550 1040 1800 980 2010 1010" strokeWidth="40" opacity="0" />
                </g>
                {/* localized lime glows */}
                <g id="fungi">
                  {[[842, 320], [1092, 436], [420, 952], [1495, 568]].map(([cx, cy], i) => (
                    <g key={i} transform={`translate(${cx}, ${cy})`}>
                      <rect x="-3" y="-14" width="6" height="14" fill="#65a30d" />
                      <circle className="fun-cap" cx="0" cy="-18" r="11" fill="#a3e635" filter="url(#glow)" opacity="0.15" />
                    </g>
                  ))}
                </g>
                {/* the four contributing currents → one broad stream */}
                <g fill="none" strokeLinecap="round">
                  <path id="cur-cobalt" d="M -80 860 C 300 828 640 884 1000 848 C 1300 818 1560 872 1990 838" stroke="#1d4ed8" strokeWidth="5" />
                  <path id="cur-royal" d="M 1215 430 C 1238 570 1256 700 1258 842" stroke="#2563eb" strokeWidth="7" />
                  <path id="cur-cyan" d="M 1595 1035 C 1572 950 1558 880 1560 850" stroke="#22d3ee" strokeWidth="7" />
                  <path id="cur-turq" d="M 1845 400 C 1822 540 1806 690 1800 846" stroke="#5eead4" strokeWidth="7" />
                  <path id="stream-glow" d="M -80 860 C 300 828 640 884 1000 848 C 1300 818 1560 872 1990 838" stroke="#60a5fa" strokeWidth="34" filter="url(#glow)" opacity="0" />
                </g>
                <polygon id="shaft-light" points="1690,0 1870,0 1780,560 1620,560" fill="url(#shaft-gradient)" opacity="0" />
                {/* simple bioluminescent cave insects — no anatomy */}
                <g id="bugs">
                  <g transform="translate(760, 520)"><g className="bug"><polygon points="0,-16 11,0 0,16 -11,0" fill="#a5f3fc" opacity="0" /></g></g>
                  <g transform="translate(1180, 470)"><g className="bug"><ellipse rx="13" ry="6" fill="#67e8f9" opacity="0" /></g></g>
                  <g transform="translate(1385, 530)"><g className="bug"><circle r="5" fill="#e0f2fe" opacity="0" /></g></g>
                  <g transform="translate(980, 905)"><g className="bug"><polygon points="0,-13 9,0 0,13 -9,0" fill="#a5f3fc" opacity="0" /></g></g>
                  <g transform="translate(1650, 915)"><g className="bug"><ellipse rx="11" ry="5" fill="#67e8f9" opacity="0" /></g></g>
                  <g transform="translate(520, 610)"><g className="bug"><circle r="4" fill="#e0f2fe" opacity="0" /></g></g>
                </g>
              </g>

              {/* ===== CHAPTER 8 · POND CLEARING ===== */}
              <g id="pond" opacity="0">
                <rect x="0" y="0" width="1920" height="640" fill="#0b1026" />
                <g id="pond-stars" opacity="0.45">
                  {[[180, 110], [420, 70], [660, 150], [940, 60], [1180, 130],
                    [1440, 80], [1680, 160], [300, 260], [1560, 280], [820, 220]]
                    .map(([cx, cy], i) => (
                      <circle key={i} cx={cx} cy={cy} r={1.8} fill="#e2e8f0" />
                    ))}
                </g>
                <path d="M 0 660 Q 160 596 340 640 T 700 632 T 1060 644 T 1420 630 T 1780 646 L 1920 620 V 700 H 0 Z" fill="#0c1428" />
                <ellipse cx="960" cy="880" rx="660" ry="195" fill="url(#pond-gradient)" />
                <ellipse cx="960" cy="880" rx="660" ry="195" fill="none" stroke="#164e63" strokeWidth="3" opacity="0.6" />
                <g transform="translate(960, 852)">
                  <g id="ripple-w-0"><ellipse rx="150" ry="34" fill="none" stroke="#67e8f9" strokeWidth="3" opacity="0" /></g>
                  <g id="ripple-w-1"><ellipse rx="150" ry="34" fill="none" stroke="#67e8f9" strokeWidth="3" opacity="0" /></g>
                  <g id="ripple-w-2"><ellipse rx="150" ry="34" fill="none" stroke="#67e8f9" strokeWidth="3" opacity="0" /></g>
                </g>
                {/* restrained decorative arcs where fireflies meet cave insects */}
                <g id="meet-arcs" fill="none" stroke="#e2e8f0" strokeWidth="2.5">
                  <path d="M 780 700 Q 960 640 1140 700" />
                  <path d="M 800 728 Q 960 678 1120 728" />
                </g>
                <g id="pond-flies" opacity="0" filter="url(#glow)">
                  <circle cx="700" cy="760" r={4.5} fill="#fde047" />
                  <circle cx="764" cy="722" r={4} fill="#fde047" />
                  <circle cx="830" cy="782" r={4.5} fill="#fde047" />
                  <circle cx="684" cy="812" r={3.5} fill="#fde047" />
                </g>
                <g id="pond-bugs" opacity="0">
                  <polygon points="1180,764 1191,780 1180,796 1169,780" fill="#a5f3fc" />
                  <ellipse cx="1252" cy="748" rx="12" ry="5.5" fill="#67e8f9" />
                  <circle cx="1216" cy="812" r={4.5} fill="#e0f2fe" />
                </g>
                <g id="pond-branch">
                  <path d="M 1985 545 Q 1650 570 1290 600" stroke="#241a14" strokeWidth="20" fill="none" strokeLinecap="round" />
                  <path d="M 1430 585 q -60 12 -112 4" stroke="#241a14" strokeWidth="9" fill="none" strokeLinecap="round" />
                  <circle cx="1360" cy="598" r={9} fill="#241a14" />
                </g>
                <path d="M 120 1080 q 10 -90 -18 -150 M 160 1080 q 26 -80 8 -160 M 1780 1080 q -8 -96 20 -150 M 1740 1080 q -24 -84 -6 -164" stroke="#03121f" strokeWidth="10" fill="none" strokeLinecap="round" />
              </g>

              {/* ===== CHAPTER 5 · RAT & GOLDEN SOUND RINGS ===== */}
              <g transform="translate(660, 952)">
                <g id="rat" opacity="0">
                  <path className="fur" d="M -34 6 Q -30 -16 -6 -18 Q 22 -20 34 -4 Q 40 6 32 12 L -26 14 Q -34 12 -34 6 Z" fill="#94a3b8" />
                  <circle className="fur" cx="-30" cy="-10" r={9} fill="#94a3b8" />
                  <circle cx="-33" cy="-12" r={2.2} fill="#0f172a" />
                  <path d="M 34 2 q 26 4 34 -8" stroke="#cbd5e1" strokeWidth="3" fill="none" strokeLinecap="round" />
                </g>
              </g>
              {['ring-w-1', 'ring-w-2', 'ring-w-3'].map((cls) => (
                <g key={cls} transform="translate(640, 928)">
                  <g className={cls} opacity="0">
                    <circle r={36} fill="none" stroke="#fbbf24" strokeWidth="5" filter="url(#glow)" />
                  </g>
                </g>
              ))}

              {/* ===== THE OWL · persistent protagonist (perched → gliding → diving → landing) ===== */}
              <g id="owl-flight" opacity="0">
                <g id="owl-rotor">
                  <path d="M -34 18 L -60 46 L -28 42 Z" fill="#fcd34d" />
                  <g transform="translate(-8, -24)">
                    <g className="wing wf">
                      <path d="M 0 0 C -18 -34 -10 -78 18 -96 C 26 -66 30 -34 14 -4 Z" fill="#fbbf24" opacity="0.85" />
                    </g>
                  </g>
                  <path d="M -36 6 C -40 -28 -12 -46 14 -42 C 40 -38 50 -12 44 14 C 38 40 8 52 -12 44 C -30 38 -33 24 -36 6 Z" fill="#fef3c7" />
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
                  <g transform="translate(6, -20)">
                    <g className="wing wn">
                      <path d="M 0 0 C -6 -40 10 -88 44 -104 C 44 -70 36 -30 12 -2 Z" fill="#fcd34d" />
                    </g>
                  </g>
                </g>
              </g>

              {/* dark aperture — masks the descent through the burrow */}
              <rect id="aperture" x="0" y="0" width="1920" height="1080" fill="#01030a" mask="url(#aperture-mask)" opacity="0" />

              {/* ===== CHAPTER 8 · LETTERS + MOON-O HALO ===== */}
              <circle id="halo" cx="790" cy="400" r={86} fill="none" stroke="#fef08a" strokeWidth="3" filter="url(#glow)" opacity="0" />
              <g id="letters" stroke="#fdf6e3" strokeWidth="11" fill="none" strokeLinecap="round" filter="url(#glow)">
                <g id="ltr-q" opacity="0">
                  <circle cx="620" cy="400" r={56} />
                  <path d="M 646 430 L 676 460" />
                </g>
                <g id="ltr-z" opacity="0"><path d="M 908 352 L 1012 352 L 908 448 L 1012 448" /></g>
                <g id="ltr-y" opacity="0"><path d="M 1088 352 L 1130 412 L 1172 352 M 1130 412 L 1130 448" /></g>
                <g id="ltr-d" opacity="0"><path d="M 1258 352 L 1258 448 M 1258 352 C 1334 350 1334 450 1258 448" /></g>
              </g>

              {/* reveal O · same moon photo, but layered ABOVE the pond sky
                  rect so the full moon forms the "O" in QOZYD instead of the
                  halo ring alone. Original #moon-wrap stays for Ch.1–7. */}
              <g id="moon-o" opacity="0">
                <circle fill="url(#moon-gradient)" filter="url(#glow)" r="140" opacity="0.5" />
                <image href={moonUrl} x="-122.5" y="-122.2" width="245" height="244.4" />
              </g>

              <rect x="0" y="0" width="1920" height="1080" fill="url(#global-vignette-gradient)" pointerEvents="none" />
            </svg>

            {/* "Start the journey." — revealed by the scrub itself */}
            <div className="cta-text">
              <button type="button" className="cta-button" onClick={replay}>
                Start the journey
              </button>
            </div>

            {/* DEBUG HUD — dev-only; stripped from production builds entirely */}
            {import.meta.env.DEV && (
              <div className="qozyd-hud" ref={hudRef}>booting…</div>
            )}
          </div>
        </div>
      </div>
    );
  }











