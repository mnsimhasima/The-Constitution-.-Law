import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'An unexpected error occurred.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Application ErrorBoundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#F4F6FA] dark:bg-[#090B10] p-6">
          <div className="max-w-md w-full rounded-[28px] bg-white dark:bg-[#121620] border border-[#E4E8F0] dark:border-[#222938] p-7 space-y-4 text-center">
            <h1 className="font-display text-2xl font-bold text-[#0C1018] dark:text-[#F3F6FB]">
              Something interrupted your session
            </h1>
            <p className="text-sm text-[#525C6E] dark:text-[#94A0B8] break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-[44px] px-5 rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
