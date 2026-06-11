import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router';
import '@fontsource-variable/inter'; // self-hosted geometric sans (bundled, no CDN)
import { DesignPage } from './pages/DesignPage';
import { HomePage } from './pages/HomePage';
import { UploadPage } from './pages/UploadPage';
import { VariantsPage } from './pages/StubPages';
import { VerifyPage } from './pages/VerifyPage';
import { AppErrorBoundary } from './components/ui/AppErrorBoundary';
import { ErrorOverlay } from './components/ui/ErrorOverlay';
import { installGlobalErrorHandlers } from './store/error-store';
import './styles.css';

const queryClient = new QueryClient();

// Surface uncaught errors + rejected promises on screen, not just in the console.
installGlobalErrorHandlers();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* Always-on-top error toasts; sits outside the boundary so it still shows
          if the routed tree itself crashed. */}
      <ErrorOverlay />
      <AppErrorBoundary>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/design/:projectId" element={<DesignPage />} />
            <Route path="/canvas" element={<DesignPage />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/verify" element={<VerifyPage />} />
            <Route path="/variants" element={<VariantsPage />} />
          </Routes>
        </BrowserRouter>
      </AppErrorBoundary>
    </QueryClientProvider>
  </StrictMode>,
);
