// Rede de segurança: sem isto, qualquer erro de render deixa a tela preta
// (o React desmonta a árvore inteira). Aqui o erro fica visível e a
// dashboard continua recuperável com um clique.
import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}
interface State {
  erro: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { erro: null };

  static getDerivedStateFromError(erro: Error): State {
    return { erro };
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error('Erro na interface:', erro, info.componentStack);
  }

  render() {
    const { erro } = this.state;
    if (!erro) return this.props.children;

    return (
      <div className="min-h-screen grid place-items-center p-6">
        <div className="max-w-[520px] w-full bg-card border border-line rounded-card p-6 text-center">
          <span className="inline-grid place-items-center w-12 h-12 rounded-[14px] bg-red/[0.13] text-red mb-4">
            <AlertTriangle size={24} />
          </span>
          <h1 className="text-[17px] font-bold text-tx mb-2">A tela travou, mas seus dados estão salvos</h1>
          <p className="text-[13px] text-dim mb-1">
            Nada foi perdido — tudo fica na nuvem. Recarregue para voltar ao normal.
          </p>
          <p className="mono text-[11.5px] text-dim2 bg-card2 border border-line2 rounded-[10px] px-3 py-2 my-4 break-words text-left">
            {erro.message || String(erro)}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 text-white px-5 py-[11px] rounded-[10px] text-[13.5px] font-semibold bg-gradient-to-br from-pur3 to-pur"
          >
            <RefreshCw size={16} /> Recarregar a dashboard
          </button>
        </div>
      </div>
    );
  }
}
