import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { Pill } from './Pill.tsx';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');

const isPill = window.location.hash === '#pill';
if (isPill) document.documentElement.classList.add('pill');

createRoot(root).render(<StrictMode>{isPill ? <Pill /> : <App />}</StrictMode>);
