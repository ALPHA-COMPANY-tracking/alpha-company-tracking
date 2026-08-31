// Service worker: recebe o push do servidor e mostra a notificação no
// celular, mesmo com o app fechado.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let dado = {};
  try {
    dado = event.data ? event.data.json() : {};
  } catch {
    dado = { titulo: 'AJ Alpha Company', corpo: event.data ? event.data.text() : '' };
  }

  const titulo = dado.titulo || 'AJ Alpha Company';
  const opcoes = {
    body: dado.corpo || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    // Agrupa por tipo: um pedido novo não apaga o aviso de pagamento.
    tag: dado.tag || 'pedido',
    renotify: true,
    vibrate: [90, 40, 90],
    data: { url: dado.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(titulo, opcoes));
});

// Tocar na notificação abre o app (ou foca a aba já aberta).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
      for (const cliente of lista) {
        if ('focus' in cliente) return cliente.focus();
      }
      return self.clients.openWindow(destino);
    }),
  );
});
