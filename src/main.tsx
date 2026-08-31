import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

// Safety interceptor for benign sandbox or async errors
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    console.warn('Prevented unhandled promise rejection in sandbox environment:', event.reason);
    event.preventDefault();
  });

  window.addEventListener('error', (event) => {
    if (event.error) {
      console.warn('Caught global window error:', event.error);
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

