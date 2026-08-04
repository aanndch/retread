import { render } from 'preact'
import './styles.css'
import { App } from './App.tsx'
import { registerSW } from 'virtual:pwa-register'

import { initTheme } from './theme'
import { handleOAuthRedirect } from './gdrive'

// Initialize color theme before rendering to avoid layout flashes
initTheme()

// Consume a Google Drive OAuth return (the token lands in the URL fragment)
// BEFORE the app mounts, so the hash router never sees the fragment.
handleOAuthRedirect()

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
