import { render } from 'preact'
import './styles.css'
import { App } from './App.tsx'
import { registerSW } from 'virtual:pwa-register'

import { initTheme } from './theme'

// Initialize color theme before rendering to avoid layout flashes
initTheme()

// Register the PWA service worker automatically
registerSW({ immediate: true })

render(<App />, document.getElementById('app')!)
