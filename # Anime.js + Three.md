# Anime.js + Three.js Architectural Rules

## 1. Animation Target Pattern
- Never invoke anime() inside the Three.js requestAnimationFrame() render loop. 
- Pass the Three.js object properties directly to the Anime.js "targets" parameter.
- Example pattern for Cline:
  ```javascript
  anime({
    targets: mesh.rotation,
    y: Math.PI * 2,
    duration: 2000,
    easing: 'easeInOutSine'
  });
  ```

## 2. Camera Controls & Timelines
- When creating cinematic 3D website reveals, use `anime.timeline()` to sequence camera positions (`camera.position`) and lookAt vectors simultaneously.
- Always ensure `controls.update()` is called in the main render loop if using OrbitControls alongside Anime.js camera animations.

## 3. DOM to 3D Syncing
- If animating HTML overlay text or SVGs alongside 3D meshes, group them under a unified Anime.js timeline using staggered delays to keep the WebGL scene and DOM perfectly synchronized.
