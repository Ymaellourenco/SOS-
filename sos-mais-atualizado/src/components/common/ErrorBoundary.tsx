import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { logger } from '../../lib/logger';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-dvh p-8 text-center bg-[#fbfbfd]">
          <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mb-6 ios-shadow">
            <AlertCircle className="w-10 h-10 text-red-600" />
          </div>
          <h1 className="text-xl font-display font-black text-slate-800 uppercase tracking-tight mb-2">
            Algo correu mal
          </h1>
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest max-w-xs mb-8">
            O sistema de salvamento encontrou um erro crítico inesperado.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 px-8 py-4 bg-slate-900 text-white rounded-full text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl active:scale-95"
          >
            <RefreshCw className="w-4 h-4" />
            Reiniciar Sistema
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
