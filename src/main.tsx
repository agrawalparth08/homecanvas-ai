import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router';
import { DesignPage } from './pages/DesignPage';
import { HomePage } from './pages/HomePage';
import { UploadPage, VariantsPage, VerifyPage } from './pages/StubPages';
import './styles.css';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
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
    </QueryClientProvider>
  </StrictMode>,
);
