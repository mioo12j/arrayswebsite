import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { I18nProvider } from './context/I18nContext.jsx';
import { BranchProvider } from './context/BranchContext.jsx';
import { UnsavedChangesProvider } from './context/UnsavedChangesContext.jsx';
import { ToastProvider } from './components/ui/Toast.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <I18nProvider>
        <ToastProvider>
          <AuthProvider>
            <BranchProvider>
              <UnsavedChangesProvider>
                <App />
              </UnsavedChangesProvider>
            </BranchProvider>
          </AuthProvider>
        </ToastProvider>
      </I18nProvider>
    </BrowserRouter>
  </React.StrictMode>
);
