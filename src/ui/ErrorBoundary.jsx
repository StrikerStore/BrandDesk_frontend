import { Component } from 'react';
import styles from './ErrorBoundary.module.css';

/**
 * Without this, any render exception unmounts the tree and leaves a blank
 * white screen with no way back — the agent's only clue is the console.
 */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled render error:', error, info.componentStack);
    this.setState({ stack: info.componentStack });
  }

  handleCopy = () => {
    const { error, stack } = this.state;
    navigator.clipboard?.writeText(
      `${error?.name}: ${error?.message}\n${error?.stack || ''}\n\nComponent stack:${stack || ''}`
    );
  };

  render() {
    const { error, stack } = this.state;
    if (!error) return this.props.children;

    return (
      <div className={styles.root} role="alert">
        <div className={styles.card}>
          <div className={styles.icon} aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" /><path d="M12 7v6m0 4h.01" />
            </svg>
          </div>
          <h1 className={styles.title}>Something broke</h1>
          <p className={styles.sub}>
            This screen hit an unexpected error. Your unsent reply may be lost — reloading
            is safe for everything already saved.
          </p>
          <div className={styles.actions}>
            <button className={styles.primary} onClick={() => window.location.reload()}>
              Reload BrandDesk
            </button>
            <button className={styles.secondary} onClick={this.handleCopy}>
              Copy error details
            </button>
          </div>
          <details className={styles.details}>
            <summary className={styles.summary}>Technical details</summary>
            <pre className={styles.pre}>{error.message}{stack}</pre>
          </details>
        </div>
      </div>
    );
  }
}
