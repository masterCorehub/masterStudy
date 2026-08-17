import React from 'react';

const CHUNK_RELOAD_KEY = 'studyhub:chunk-reload-at';

function isStaleChunkError(error) {
  const message = String(error?.message || error || '');
  return /dynamically imported module|failed to fetch dynamically imported|importing a module script failed|chunkloaderror/i.test(message);
}

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
    if (isStaleChunkError(error) && typeof window !== 'undefined') {
      const lastReload = Number(window.sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
      if (Date.now() - lastReload > 30_000) {
        window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
        window.location.reload();
        return;
      }
    }
    this.setState({ error, errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', background: '#fee', color: '#900', minHeight: '100vh', fontFamily: 'monospace' }}>
          <h2>Não foi possível carregar esta tela.</h2>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ margin: '0 0 1rem', padding: '.7rem 1rem', border: 0, borderRadius: '.6rem', background: '#1e293b', color: '#fff', cursor: 'pointer' }}
          >
            Atualizar aplicação
          </button>
          <details style={{ whiteSpace: 'pre-wrap' }}>
            {this.state.error && this.state.error.toString()}
            <br />
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </details>
        </div>
      );
    }

    return this.props.children; 
  }
}
