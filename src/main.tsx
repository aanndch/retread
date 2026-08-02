import { render } from 'preact'
import './styles.css'
import { App } from './App.tsx'
import { registerSW } from 'virtual:pwa-register'

// Register the PWA service worker automatically
registerSW({ immediate: true })

render(<App />, document.getElementById('app')!)
