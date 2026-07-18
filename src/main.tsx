import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import posthog from 'posthog-js'
import './index.css'
import App from './App.tsx'

// Initialize PostHog
if (import.meta.env.VITE_POSTHOG_KEY) {
  posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
    api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
    person_profiles: 'identified_only' // or 'always' to create profiles for anonymous users as well
  })
} else {
  console.warn('PostHog API key is missing. Analytics will not be tracked.')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
