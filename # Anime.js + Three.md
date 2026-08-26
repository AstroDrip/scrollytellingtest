# React + Anime.js 2.5D Scroll Narrative Rules

## 1. The Scroll-Mapping Architecture
- Never instantiate a new `anime()` instance on every window scroll event.
- Use a single master Anime.js timeline instance (`anime.timeline({ autoplay: false })`) stored inside a React `useRef`.
- Map the Sscroll progress percentage (from Lenis or native scroll) cleanly to the timeline using `timeline.seek(progress * timeline.duration)`.

## 2. 2.5D Layer Separation Pattern
- All narrative scenes must be structured using explicit layered absolute containers (`zIndex`, `translateZ`).
- Group animations by "Scenes" inside the Anime.js timeline using absolute timeline offsets (e.g., scene 2 starts exactly when scene 1 finishes).

## 3. DOM Element Ref Pattern
- Ensure Cline targets DOM nodes using React `useRef` arrays or elements, NEVER global document selectors (`.class-name`).
- Example structural pattern for Cline:
