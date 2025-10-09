import React from 'react'
import { createRoot } from 'react-dom/client'
import { Authenticator } from '@aws-amplify/ui-react'
import '@aws-amplify/ui-react/styles.css'
import './amplify-config'
import App from './App'
// Add global styles
import './styles.css'
import './authenticator-theme.css'

const root = createRoot(document.getElementById('root')!)
root.render(
  <React.StrictMode>
    <Authenticator>
      <App />
    </Authenticator>
  </React.StrictMode>
)