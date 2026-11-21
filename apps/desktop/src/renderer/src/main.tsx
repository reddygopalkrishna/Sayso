import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { OpenInApp } from './OpenInApp.tsx';
import { hasCurrentApi, RestartNeeded } from './RestartNeeded.tsx';
import { Chip } from './Chip.tsx';
import { Pill } from './Pill.tsx';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');

const view = window.location.hash;
// The pill and the chip are transparent windows; only the shape itself is drawn.
if (view === '#pill' || view === '#chip') document.documentElement.classList.add('pill');

// window.sayso comes from the Electron preload. Without it (the dev URL opened in a normal
// browser) there is no app to talk to, so say where the real window is instead of a blank page.
const inElectron = typeof window.sayso !== 'undefined';

createRoot(root).render(
  <StrictMode>
    {!inElectron ? (
      <OpenInApp />
    ) : view === '#pill' ? (
      <Pill />
    ) : view === '#chip' ? (
      <Chip />
    ) : hasCurrentApi(window.sayso) ? (
      <App />
    ) : (
      <RestartNeeded />
    )}
  </StrictMode>,
);
