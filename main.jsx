import { createRoot } from 'react-dom/client';
// eslint-disable-next-line import/extensions
import Scrollytelling from './Scrollytelling.jsx';

/**
 * Standalone entry — the entire page IS the story.
 * No StrictMode: effects must not double-invoke, so the scroll
 * observers/timeline attach exactly once.
 */
createRoot(document.getElementById('root')).render(<Scrollytelling />);
