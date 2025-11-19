import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { InputInjectionProvider } from './contexts/InputInjectionContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <InputInjectionProvider>
      <App />
    </InputInjectionProvider>
  </StrictMode>
);
