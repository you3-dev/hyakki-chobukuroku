'use strict';

// M5-E: この値を変更すると新しいキャッシュへ原子的に切り替わる。
const CACHE_PREFIX = 'hyakki-chobukuroku-';
const CACHE_VERSION = '1.0.0-rc.7';
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;

const APP_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/version.js',
  './js/time.js',
  './js/data.js',
  './js/art.js',
  './js/achievements.js',
  './js/progression.js',
  './js/state.js',
  './js/run.js',
  './js/battle.js',
  './js/main.js',
  './js/pwa.js',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/favicon-32.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/title/title-keyart.webp',
  './assets/art/amanojaku.webp',
  './assets/art/amefuri.webp',
  './assets/art/byakko.webp',
  './assets/art/chochin.webp',
  './assets/art/daitengu.webp',
  './assets/art/dokuga.svg',
  './assets/art/dorotabo.webp',
  './assets/art/furi.webp',
  './assets/art/gaikotsu.webp',
  './assets/art/gashadokuro.webp',
  './assets/art/gashadokuro-revenant.webp',
  './assets/art/genbu.webp',
  './assets/art/hakutaku.webp',
  './assets/art/hitotsume.webp',
  './assets/art/hyakume.webp',
  './assets/art/isonade.webp',
  './assets/art/itsumade.webp',
  './assets/art/iwakabuto.svg',
  './assets/art/juzu.svg',
  './assets/art/kamaitachi.webp',
  './assets/art/kanzashi.svg',
  './assets/art/kappa.webp',
  './assets/art/karakasa.webp',
  './assets/art/karasutengu.webp',
  './assets/art/kasha.webp',
  './assets/art/kawauso.webp',
  './assets/art/kirin.webp',
  './assets/art/kodama.webp',
  './assets/art/kudagitsune.webp',
  './assets/art/kyubi.webp',
  './assets/art/muramasa.webp',
  './assets/art/nekomata.webp',
  './assets/art/nue.webp',
  './assets/art/nurikabe.webp',
  './assets/art/nurarihyon.webp',
  './assets/art/nureonna.webp',
  './assets/art/oboroguruma.webp',
  './assets/art/ogama.webp',
  './assets/art/okuriinu.webp',
  './assets/art/omukade.webp',
  './assets/art/onibi.webp',
  './assets/art/oniudewa.svg',
  './assets/art/onyudo.webp',
  './assets/art/orochi.webp',
  './assets/art/orochi-revenant.webp',
  './assets/art/ryujin.webp',
  './assets/art/satori.webp',
  './assets/art/seiryu.webp',
  './assets/art/senrigan.svg',
  './assets/art/shibarinawa.svg',
  './assets/art/shiranui.webp',
  './assets/art/shutendoji.webp',
  './assets/art/shutendoji-revenant.webp',
  './assets/art/suzaku.webp',
  './assets/art/tamamo.webp',
  './assets/art/tanuki.webp',
  './assets/art/tatarigami.webp',
  './assets/art/tesso.webp',
  './assets/art/tengugeta.svg',
  './assets/art/tsuchigumo.webp',
  './assets/art/tsukumogami.webp',
  './assets/art/umibozu.webp',
  './assets/art/wanyudo.webp',
  './assets/art/yamanba.webp',
  './assets/art/yamawaro.webp',
  './assets/art/yatagarasu.webp',
  './assets/art/yoroi.webp',
  './assets/art/yukionna.webp',
  './assets/art/zashiki.webp',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function cachedResponse(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}

async function navigationResponse(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put('./index.html', response.clone());
    }
    return response;
  } catch (error) {
    return (await caches.match('./index.html')) || caches.match('./');
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(request.mode === 'navigate' ? navigationResponse(request) : cachedResponse(request));
});
