import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Logo } from '@/components/Logo';

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
    <div className="relative min-h-screen grid place-items-center bg-bg px-4 overflow-hidden">
      {/* brilho dourado de fundo */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(560px 420px at 50% 26%, rgba(212,175,55,0.14), transparent 70%), radial-gradient(700px 500px at 50% 120%, rgba(168,121,46,0.08), transparent 70%)',
        }}
      />
      <div className="relative w-full max-w-[400px]">
        {/* Logo */}
        <div className="flex flex-col items-center mb-7">
          <Logo width={230} className="drop-shadow-[0_10px_40px_rgba(212,175,55,0.18)]" />
        </div>

        <div className="bg-card/90 backdrop-blur border border-gold/20 rounded-card p-6 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.7)]">
          <div className="flex items-center gap-2 mb-1">
            <span className="h-px flex-1 bg-gradient-to-r from-transparent to-gold/40" />
            <h1 className="m-0 text-[13px] font-bold text-gold2 tracking-[0.18em] uppercase">
              {modo === 'entrar' ? 'Entrar' : 'Criar conta'}
            </h1>
            <span className="h-px flex-1 bg-gradient-to-l from-transparent to-gold/40" />
          </div>
          <p className="mt-0 mb-5 text-[12.5px] text-dim text-center">
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
                className="w-full bg-card2 border border-line2 rounded-[10px] px-3 py-[11px] text-tx text-[13px] outline-none focus:border-gold/60 transition-colors"
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
                className="w-full bg-card2 border border-line2 rounded-[10px] px-3 py-[11px] text-tx text-[13px] outline-none focus:border-gold/60 transition-colors"
              />
            </label>

            {erro && <div className="text-red text-[12px]">{erro}</div>}
            {aviso && <div className="text-grn text-[12px]">{aviso}</div>}

            <button
              type="submit"
              disabled={carregando}
              className="mt-1 inline-flex items-center justify-center gap-2 bg-gold-metal text-[#2a1e08] px-4 py-[12px] rounded-[10px] text-[13.5px] font-extrabold tracking-wide disabled:opacity-60 hover:brightness-105 shadow-[0_8px_24px_-8px_rgba(212,175,55,0.5)] transition"
            >
              {carregando && <Loader2 size={16} className="animate-spin" />}
              {modo === 'entrar' ? 'ENTRAR' : 'CRIAR CONTA'}
            </button>
          </form>

          <button
            onClick={() => {
              setModo(modo === 'entrar' ? 'cadastrar' : 'entrar');
              setErro('');
              setAviso('');
            }}
            className="w-full text-center mt-4 text-[12.5px] text-dim2 hover:text-gold2 transition-colors"
          >
            {modo === 'entrar' ? 'Não tem conta? Criar agora' : 'Já tem conta? Entrar'}
          </button>
        </div>

        <p className="text-center text-[10.5px] text-dim2 tracking-[0.25em] mt-5 uppercase">
          AJ Alpha Company · After Pay
        </p>
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
