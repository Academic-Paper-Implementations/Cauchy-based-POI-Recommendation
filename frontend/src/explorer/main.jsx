import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import ErrorBoundary from '../components/error-boundary.jsx';
import ExplorerApp from './explorer-app.jsx';

// The Explorer is the app: a minimal end-user front end over the co-location
// miner. It mounts here from the root index.html.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <ExplorerApp />
    </ErrorBoundary>
  </StrictMode>
);
