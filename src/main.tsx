import { render } from 'preact'
import './styles.css'
import { App } from './App.tsx'
import { registerSW } from 'virtual:pwa-register'

import { initTheme } from './theme'

// Initialize color theme before rendering to avoid layout flashes
initTheme()

// Register the PWA service worker — deferred until idle to avoid interrupting in-flight requests
let swUpdate: (() => Promise<void>) | null = null;
const updateSW = registerSW({
  immediate: false,
  onNeedRefresh() {
    swUpdate = () => updateSW();
    window.dispatchEvent(new Event('sw-update'));
  },
});
export function getSWUpdate() { return swUpdate; }

render(<App />, document.getElementById('app')!)
