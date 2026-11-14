import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ar } from '../i18n/ar';
import { ToastContainer } from '../components/ui/Dialogs';
import { Button } from '../components/ui/Primitives';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
          <div className="max-w-md rounded-xl border border-red-200 bg-white p-6 text-center">
            <h1 className="text-lg font-bold text-slate-900">حدث خطأ غير متوقع في الواجهة</h1>
            <p className="mt-2 text-sm text-slate-600">
              {this.state.error?.message || ar.errors.UNKNOWN}
            </p>
            <Button
              className="mt-4"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.href = '/';
              }}
            >
              إعادة تحميل اللوحة
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        {children}
        <ToastContainer />
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}
