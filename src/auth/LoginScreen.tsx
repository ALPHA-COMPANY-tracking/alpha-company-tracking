import { useState } from 'react';
import { Loader2, TrendingUp } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export function LoginScreen() {
  const [modo, setModo] = useState<'entrar' | 'cadastrar'>('entrar');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setErro('');
    setAviso('');
    setCarregando(true);
    try {
      if (modo === 'entrar') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password: senha });
        if (error) throw error;
        if (!data.session) setAviso('Conta criada! Confira seu e-mail para confirmar e depois entre.');
      }
    } catch (err) {
      setErro(traduzErro(err));
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-bg px-4">
      <div className="w-full max-w-[380px]">
        <div className="flex items-center justify-center gap-2 mb-6">
          <span className="w-10 h-10 rounded-[12px] bg-grn/[0.13] grid place-items-center text-grn">
            <TrendingUp size={20} strokeWidth={1.9} />
          </span>
          <span className="text-[17px] font-bold text-tx">Dashboard Financeiro</span>
        </div>

        <div className="bg-card border border-line rounded-card p-6">
          <h1 className="m-0 text-[16px] font-bold text-tx mb-1">
            {modo === 'entrar' ? 'Entrar' : 'Criar conta'}
          </h1>
          <p className="mt-0 mb-5 text-[12.5px] text-dim">
            {modo === 'entrar' ? 'Acesse seu P&L na nuvem.' : 'Crie sua conta para salvar na nuvem.'}
          </p>

          <form onSubmit={enviar} className="flex flex-col gap-3">
            <label className="block">
              <span className="block text-[11px] text-dim2 font-medium mb-[6px] uppercase tracking-wide">E-mail</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-card2 border border-line2 rounded-[10px] px-3 py-[10px] text-tx text-[13px] outline-none focus:border-pur"
              />
            </label>
            <label className="block">
              <span className="block text-[11px] text-dim2 font-medium mb-[6px] uppercase tracking-wide">Senha</span>
              <input
                type="password"
                required
                minLength={6}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="w-full bg-card2 border border-line2 rounded-[10px] px-3 py-[10px] text-tx text-[13px] outline-none focus:border-pur"
              />
            </label>

            {erro && <div className="text-red text-[12px]">{erro}</div>}
            {aviso && <div className="text-grn text-[12px]">{aviso}</div>}

            <button
              type="submit"
              disabled={carregando}
              className="mt-1 inline-flex items-center justify-center gap-2 text-white px-4 py-[11px] rounded-[10px] text-[13.5px] font-semibold bg-gradient-to-br from-pur3 to-pur disabled:opacity-60"
            >
              {carregando && <Loader2 size={16} className="animate-spin" />}
              {modo === 'entrar' ? 'Entrar' : 'Criar conta'}
            </button>
          </form>

          <button
            onClick={() => {
              setModo(modo === 'entrar' ? 'cadastrar' : 'entrar');
              setErro('');
              setAviso('');
            }}
            className="w-full text-center mt-4 text-[12.5px] text-dim2 hover:text-dim"
          >
            {modo === 'entrar' ? 'Não tem conta? Criar agora' : 'Já tem conta? Entrar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function traduzErro(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
  if (/already registered/i.test(msg)) return 'Este e-mail já tem conta. Faça login.';
  if (/password should be at least/i.test(msg)) return 'A senha precisa ter ao menos 6 caracteres.';
  return msg;
}
