import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import './styles/brand-system.css'

// Apply persisted font-size preference before first paint.
import { applyFontScale, getFontScale } from './lib/appearance';
applyFontScale(getFontScale());

createRoot(document.getElementById("root")!).render(<App />);
