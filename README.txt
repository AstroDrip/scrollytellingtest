Owl Rig v2
==========

1. Extract this folder into your repo root.
2. Replace the repo's OwlRig.jsx with the bundled OwlRig.jsx.
3. Copy owlRigMath.js and owlRigMath.test.js into the repo root.
4. Run:
       node apply-owl-rig-v2.mjs
5. Verify:
       npm test
       npm run build

What changes:
- Uses the exact 7 owl assets already in your repo.
- Root-anchors each wing PNG using its source pivot marker instead of centering it.
- Both wings attach at one shoulder point; body renders above the roots.
- Adds a dedicated wing-pose layer: folded/perched -> opening -> flight -> swoop -> folded descent -> flight -> landing.
- Keeps existing .wn/.wf shoulder choreography.
- Keeps scroll-driven root-to-tip lag.
- Idle wing motion only starts after ~180ms of actual scroll inactivity.
