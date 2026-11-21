import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { OpenInApp } from './OpenInApp.tsx';
import { Pill } from './Pill.tsx';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');

const isPill = window.location.hash === '#pill';
if (isPill) document.documentElement.classList.add('pill');

// window.sayso comes from the Electron preload. Without it (the dev URL opened in a normal
// browser) there is no app to talk to, so say where the real window is instead of a blank page.
const inElectron = typeof window.sayso !== 'undefined';

createRoot(root).render(
  <StrictMode>{!inElectron ? <OpenInApp /> : isPill ? <Pill /> : <App />}</StrictMode>,
);
