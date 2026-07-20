'use strict';

(function setupPwa() {
  const body = document.body;
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  body.classList.toggle('pwa-standalone', standalone);
  body.dataset.pwaMode = standalone ? 'standalone' : 'browser';

  let updateReady = false;

  function removeStatus() {
    const old = document.getElementById('pwa-status');
    if (old) old.remove();
  }

  function showStatus(kind, message, actionLabel) {
    removeStatus();
    const status = document.createElement('aside');
    status.id = 'pwa-status';
    status.className = `pwa-status pwa-${kind}`;
    status.setAttribute('role', kind === 'update' ? 'alert' : 'status');
    status.setAttribute('aria-live', kind === 'update' ? 'assertive' : 'polite');
    status.innerHTML = `<span aria-hidden="true">${kind === 'offline' ? '📴' : '↻'}</span><strong>${message}</strong>`;
    if (actionLabel) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = actionLabel;
      button.addEventListener('click', () => window.location.reload());
      status.appendChild(button);
    }
    body.appendChild(status);
  }

  function updateNetworkStatus() {
    body.classList.toggle('is-offline', !navigator.onLine);
    if (!navigator.onLine) showStatus('offline', 'オフラインで起動中');
    else if (!updateReady) removeStatus();
  }

  window.addEventListener('online', updateNetworkStatus);
  window.addEventListener('offline', updateNetworkStatus);
  updateNetworkStatus();

  if (!('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  let controllerChanged = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (controllerChanged || !hadController) return;
    controllerChanged = true;
    updateReady = true;
    showStatus('update', '最新版を利用できます', '更新する');
  });

  navigator.serviceWorker.register('./sw.js', { scope: './' })
    .then(registration => registration.update())
    .catch(() => { /* 通常ブラウザではゲームを継続し、次回起動時に再試行する */ });
})();
