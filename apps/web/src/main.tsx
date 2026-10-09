import '@fontsource/archivo-black/400.css';
import '@fieldday/ui/tokens.css';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { boostAvailable } from './brain/service.js';

void boostAvailable();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
