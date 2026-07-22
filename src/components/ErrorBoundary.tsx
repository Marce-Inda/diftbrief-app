/**
 * @fileoverview ErrorBoundary component for graceful error handling.
 * Catches rendering errors and displays a recovery UI instead of a blank screen.
 */

import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  /** Child components to render */
  children: ReactNode;
  /** Optional fallback UI to render on error */
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  /** Whether an error has been caught */
  hasError: boolean;
  /** The caught error message */
  errorMessage: string;
}

/**
 * Error boundary that catches rendering errors in child components.
 * Prevents the entire app from crashing with a blank screen.
 * Provides a retry mechanism to attempt recovery.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] Error capturado:', error.message);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
  }

  /**
   * Resets the error state to allow retry.
   */
  handleRetry = (): void => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="error-boundary" style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '300px',
          padding: '2rem',
          background: 'var(--color-surface, #161C22)',
          borderRadius: '12px',
          border: '1px solid var(--color-critical, #F85149)',
          margin: '1rem',
          textAlign: 'center',
        }}>
          <span style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⚠️</span>
          <h2 style={{
            color: 'var(--color-text-primary, #E8EEF5)',
            fontSize: '1.25rem',
            marginBottom: '0.5rem',
          }}>
            Algo salió mal
          </h2>
          <p style={{
            color: 'var(--color-text-secondary, #A8B3BF)',
            fontSize: '0.9rem',
            marginBottom: '1.5rem',
            maxWidth: '400px',
          }}>
            Un error inesperado impidió renderizar este panel.
            El sistema permanece operativo — puedes intentar de nuevo.
          </p>
          <code style={{
            color: 'var(--color-critical, #F85149)',
            fontSize: '0.75rem',
            background: 'var(--color-bg-base, #0F1318)',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            marginBottom: '1.5rem',
            maxWidth: '100%',
            overflow: 'auto',
          }}>
            {this.state.errorMessage}
          </code>
          <button
            onClick={this.handleRetry}
            style={{
              background: 'var(--color-drift, #5BC0EB)',
              color: 'var(--color-bg-base, #0F1318)',
              border: 'none',
              borderRadius: '8px',
              padding: '0.6rem 1.5rem',
              fontSize: '0.9rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Intentar de nuevo
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
