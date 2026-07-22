'use strict';

// M5-E: この値を変更すると新しいキャッシュへ原子的に切り替わる。
const CACHE_PREFIX = 'hyakki-chobukuroku-';
const CACHE_VERSION = '1.0.0-rc.5';
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
  './assets/art/amanojaku.svg',
  './assets/art/amefuri.svg',
  './assets/art/byakko.svg',
  './assets/art/chochin.svg',
  './assets/art/daitengu.svg',
  './assets/art/dokuga.svg',
  './assets/art/dorotabo.svg',
  './assets/art/furi.svg',
  './assets/art/gaikotsu.svg',
  './assets/art/gashadokuro.svg',
  './assets/art/genbu.svg',
  './assets/art/hakutaku.svg',
  './assets/art/hitotsume.svg',
  './assets/art/hyakume.svg',
  './assets/art/itsumade.svg',
  './assets/art/isonade.svg',
  './assets/art/iwakabuto.svg',
  './assets/art/juzu.svg',
  './assets/art/kamaitachi.svg',
  './assets/art/kanzashi.svg',
  './assets/art/kappa.svg',
  './assets/art/karakasa.svg',
  './assets/art/karasutengu.svg',
  './assets/art/kasha.svg',
  './assets/art/kawauso.svg',
  './assets/art/kirin.svg',
  './assets/art/kodama.svg',
  './assets/art/kudagitsune.svg',
  './assets/art/kyubi.svg',
  './assets/art/muramasa.svg',
  './assets/art/nekomata.svg',
  './assets/art/nue.svg',
  './assets/art/nurikabe.svg',
  './assets/art/nurarihyon.svg',
  './assets/art/nureonna.svg',
  './assets/art/oboroguruma.svg',
  './assets/art/ogama.svg',
  './assets/art/okuriinu.svg',
  './assets/art/omukade.svg',
  './assets/art/onibi.svg',
  './assets/art/oniudewa.svg',
  './assets/art/onyudo.svg',
  './assets/art/orochi.svg',
  './assets/art/ryujin.svg',
  './assets/art/satori.svg',
  './assets/art/seiryu.svg',
  './assets/art/senrigan.svg',
  './assets/art/shibarinawa.svg',
  './assets/art/shiranui.svg',
  './assets/art/shutendoji.svg',
  './assets/art/suzaku.svg',
  './assets/art/tamamo.svg',
  './assets/art/tanuki.svg',
  './assets/art/tatarigami.svg',
  './assets/art/tesso.svg',
  './assets/art/tengugeta.svg',
  './assets/art/tsuchigumo.svg',
  './assets/art/tsukumogami.svg',
  './assets/art/umibozu.svg',
  './assets/art/wanyudo.svg',
  './assets/art/yamanba.svg',
  './assets/art/yamawaro.svg',
  './assets/art/yatagarasu.svg',
  './assets/art/yoroi.svg',
  './assets/art/yukionna.svg',
  './assets/art/zashiki.svg',
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
