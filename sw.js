/* Guarda os arquivos no aparelho para o sistema abrir mesmo sem internet.
   Com internet, sempre busca a versão mais nova primeiro. Ao publicar uma versão nova, troque o número em VERSAO. */
const VERSAO = 'v9';
const NOME = 'caderninho-fiado-' + VERSAO;
const ARQUIVOS = [
  'css/app.css', 'css/ph.css', 'js/app.js', 'js/controles.js', 'manifest.webmanifest',
  'fonts/Phosphor.woff2', 'fonts/figtree-latin-wght-normal.woff2', 'fonts/figtree-latin-ext-wght-normal.woff2',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(NOME).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('caderninho-fiado-') && k !== NOME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (/api\.php$/.test(u.pathname)) return;   // dados do servidor: nunca guardar em cópia
  const pagina = e.request.mode === 'navigate' || /\.(html|js|css|webmanifest)$/.test(u.pathname) || u.pathname.endsWith('/');
  if (pagina) {
    /* páginas e códigos: rede primeiro (sempre a versão nova), cópia guardada se estiver sem internet */
    e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => {
      if (r.ok) { const c = r.clone(); caches.open(NOME).then(x => x.put(e.request, c)); }
      return r;
    }).catch(() => caches.match(e.request).then(c => c || caches.match('./'))));
    return;
  }
  /* fontes e ícones: cópia guardada primeiro */
  e.respondWith(caches.match(e.request).then(c => c || fetch(e.request).then(r => {
    if (r.ok) { const k = r.clone(); caches.open(NOME).then(x => x.put(e.request, k)); }
    return r;
  })));
});
