'use client';

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui';

// ============================================
// Error Boundary for Trading Components
// Catches render errors in critical trading UI
// without crashing the entire page.
// ============================================

interface Props {
  children: ReactNode;
  /** Friendly name shown in error UI, e.g. "Order Book" */
  componentName?: string;
  /** Optional compact mode for smaller panels */
  compact?: boolean;
  /** Optional fallback override */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class TradingErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // In production, send to error reporting service
    console.error(
      `[TradingErrorBoundary] ${this.props.componentName ?? 'Component'} crashed:`,
      error,
      errorInfo
    );
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      const { componentName = 'Component', compact = false } = this.props;

      return (
        <div className={`flex flex-col items-center justify-center text-center ${compact ? 'p-4' : 'p-8'} h-full`}>
          <div className={`${compact ? 'w-8 h-8' : 'w-12 h-12'} rounded-xl bg-red-500/10 flex items-center justify-center mb-3`}>
            <AlertTriangle className={`${compact ? 'w-4 h-4' : 'w-6 h-6'} text-red-400`} />
          </div>
          <p className={`${compact ? 'text-xs' : 'text-sm'} font-medium text-white mb-1`}>
            {componentName} unavailable
          </p>
          <p className={`${compact ? 'text-[10px]' : 'text-xs'} text-gray-500 mb-3 max-w-[200px]`}>
            An error occurred while rendering this component.
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={this.handleRetry}
            icon={<RefreshCw className="w-3 h-3" />}
          >
            Retry
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
