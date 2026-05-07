import * as React from 'react';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// React 19 ships its own types but the project tsconfig has issues resolving
// the generic Component class shape — declare loosely with `any` to bypass.
const ComponentBase: any = (React as any).Component;
class ErrorBoundary extends ComponentBase {
  state: { error: Error | null; info: any } = { error: null, info: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: any) {
    console.error('App crashed:', error, info);
    this.setState({ info });
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: 'monospace', maxWidth: 900, margin: '40px auto' }}>
          <h1 style={{ color: '#dc2626', fontSize: 18, marginBottom: 12 }}>App crashed during render</h1>
          <p style={{ color: '#475569', fontSize: 13, marginBottom: 8 }}>
            {String(this.state.error.message || this.state.error)}
          </p>
          <pre style={{ background: '#0f172a', color: '#e2e8f0', padding: 16, borderRadius: 8, overflow: 'auto', fontSize: 11, whiteSpace: 'pre-wrap', maxHeight: 400 }}>
            {this.state.error.stack}
          </pre>
          {this.state.info && (
            <pre style={{ background: '#1e293b', color: '#cbd5e1', padding: 16, borderRadius: 8, overflow: 'auto', fontSize: 11, whiteSpace: 'pre-wrap', maxHeight: 400, marginTop: 12 }}>
              {this.state.info.componentStack}
            </pre>
          )}
          <button
            onClick={() => this.setState({ error: null, info: null })}
            style={{ marginTop: 16, padding: '8px 16px', background: '#3EB489', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
