import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import ErrorBoundary from '../components/error-boundary.jsx';
import ExplorerApp from './explorer-app.jsx';

// The Explorer is a separate, minimal end-user app: its own entry point and
// component tree, sharing only the low-level map/CRS/colour/api utilities with
// the research (Investor/Mining) app. It never imports the research components.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <ExplorerApp />
    </ErrorBoundary>
  </StrictMode>
);
