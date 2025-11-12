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
    <Authenticator
      components={{
        SignIn: {
          Header: () => (
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <a href="https://www.auvaria.com" target="_blank" rel="noopener noreferrer">
                <img src="/auvaria-full.svg" alt="Logo" style={{ height: '96px', width: '300px', filter: 'brightness(0) invert(0.7)', cursor: 'pointer' }} />
              </a>
            </div>
          )
        }
      }}
    >
      <App />
    </Authenticator>
  </React.StrictMode>
)