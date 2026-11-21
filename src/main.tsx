import React, { Component, ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/playfair-display/latin-600.css';
import '@fontsource/playfair-display/latin-700.css';
import '@fontsource/playfair-display/latin-500-italic.css';
import '@fontsource/jost/latin-400.css';
import '@fontsource/jost/latin-500.css';
import '@fontsource/jost/latin-600.css';
import '@fontsource/jost/latin-700.css';
import '@fontsource/outfit/latin-600.css';
import '@fontsource/outfit/latin-700.css';
import '@fontsource/syne/latin-700.css';
import '@fontsource/syne/latin-800.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/barlow-condensed/latin-800.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-600.css';
import App from './App.tsx';
import { CustomErrorPage } from './components/CustomErrorPage';
import './index.css';

// Intercept Google Maps auth/quota runtime failures and notify LocationSection & top banner
declare global {
  interface Window {
    gm_authFailure?: () => void;
    __hsGmpQuotaExceeded?: boolean;
  }
}

const triggerGmpQuotaBanner = () => {
  if (typeof window === 'undefined') return;
  window.__hsGmpQuotaExceeded = true;
  window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
};

if (typeof window !== 'undefined') {
  window.gm_authFailure = () => {
    triggerGmpQuotaBanner();
  };

  const originalConsoleError = console.error.bind(console);
  let handlingConsoleErr = false;
  console.error = (...args: unknown[]) => {
    originalConsoleError(...args);
    if (handlingConsoleErr) return;
    handlingConsoleErr = true;
    try {
      const joined = args
        .map((a) => (typeof a === 'string' ? a : a instanceof Error ? a.message : ''))
        .join(' ');
      if (
        /OverQuotaMapError|QuotaExceededError|BillingNotEnabledMapError|ApiNotActivatedMapError|Google Maps JavaScript API error/i.test(
          joined
        )
      ) {
        triggerGmpQuotaBanner();
      }
    } finally {
      handlingConsoleErr = false;
    }
  };
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class RootErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _errorInfo: ErrorInfo) {
    // Do not expose raw component stacks or internals to end users
  }

  handleReset = () => {
    this.setState({ hasError: false });
    if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') {
      window.history.replaceState(null, '', '/');
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return <CustomErrorPage statusCode={500} onReset={this.handleReset} />;
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
);
