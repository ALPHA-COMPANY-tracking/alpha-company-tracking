// ─────────────────────────────────────────────────────────────
// Inscrição do aparelho nas notificações (Web Push).
// A chave pública VAPID vem de VITE_VAPID_PUBLIC_KEY.
// ─────────────────────────────────────────────────────────────

const CHAVE_PUBLICA = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

/** base64url (VAPID) → bytes, formato exigido pelo navegador. */
function base64ParaBytes(base64: string): ArrayBuffer {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export type EstadoPush = 'indisponivel' | 'desligado' | 'ligado' | 'bloqueado';

/** O aparelho/navegador suporta notificação push? */
export function pushSuportado(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    !!CHAVE_PUBLICA
  );
}

/** Registra o service worker (idempotente). */
async function registrar(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  return reg;
}

/** Situação atual das notificações neste aparelho. */
export async function estadoPush(): Promise<EstadoPush> {
  if (!pushSuportado()) return 'indisponivel';
  if (Notification.permission === 'denied') return 'bloqueado';
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const inscricao = await reg?.pushManager.getSubscription();
    return inscricao ? 'ligado' : 'desligado';
  } catch {
    return 'desligado';
  }
}

/**
 * Pede permissão, inscreve o aparelho e guarda no servidor.
 * Retorna o novo estado.
 */
export async function ligarPush(): Promise<EstadoPush> {
  if (!pushSuportado()) return 'indisponivel';

  const permissao = await Notification.requestPermission();
  if (permissao !== 'granted') return permissao === 'denied' ? 'bloqueado' : 'desligado';

  const reg = await registrar();
  const inscricao =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64ParaBytes(CHAVE_PUBLICA!),
    }));

  const dados = inscricao.toJSON() as { endpoint?: string; keys?: Record<string, string> };
  const resp = await fetch('/api/push-subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: dados.endpoint,
      keys: dados.keys,
      apelido: navigator.userAgent.slice(0, 60),
    }),
  });
  if (!resp.ok) throw new Error('Não consegui registrar este aparelho no servidor.');

  return 'ligado';
}

/** Pede ao servidor uma notificação de teste. Devolve o texto do resultado. */
export async function enviarTeste(): Promise<string> {
  const resp = await fetch('/api/push-test', { method: 'POST' });
  const dados = (await resp.json().catch(() => ({}))) as {
    ok?: boolean;
    enviados?: number;
    aviso?: string;
    error?: string;
  };
  if (!resp.ok) throw new Error(dados.error ?? 'Falha ao enviar o teste.');
  if (!dados.ok) throw new Error(dados.aviso ?? 'Nenhum aparelho recebeu.');
  const n = dados.enviados ?? 0;
  return n > 1 ? `Enviado para ${n} aparelhos` : 'Enviado! Veja a notificação';
}

/** Cancela a inscrição deste aparelho. */
export async function desligarPush(): Promise<EstadoPush> {
  const reg = await navigator.serviceWorker.getRegistration();
  const inscricao = await reg?.pushManager.getSubscription();
  if (inscricao) {
    await fetch('/api/push-subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: inscricao.endpoint }),
    }).catch(() => undefined);
    await inscricao.unsubscribe();
  }
  return 'desligado';
}
