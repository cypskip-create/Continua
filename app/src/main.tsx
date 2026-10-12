import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'
import '@fontsource/inter/latin-800.css'
import './index.css'
import './styles/brand-system.css'

// Apply persisted font-size preference before first paint.
import { applyFontScale, getFontScale } from './lib/appearance';
applyFontScale(getFontScale());

createRoot(document.getElementById("root")!).render(<App />);
