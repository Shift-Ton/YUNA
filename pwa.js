'use strict';

(() => {
  const installButton = document.getElementById('installAppButton');
  const helpModal = document.getElementById('installHelpModal');
  const helpContent = document.getElementById('installHelpContent');
  const updateBanner = document.getElementById('pwaUpdateBanner');
  const reloadButton = document.getElementById('reloadPwaButton');

  let deferredInstallPrompt = null;
  let refreshing = false;

  const isStandalone = () => (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );

  const isIos = () => /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  const isAndroid = () => /android/i.test(window.navigator.userAgent);
  const isSecureInstallContext = () => (
    window.isSecureContext && location.protocol !== 'file:'
  );

  function showInstallButton() {
    if (!installButton || isStandalone()) return;
    installButton.hidden = false;
  }

  function hideInstallButton() {
    if (installButton) installButton.hidden = true;
  }

  function openHelpModal() {
    if (!helpModal || !helpContent) return;

    if (location.protocol === 'file:') {
      helpContent.innerHTML = `
        <p>This copy is opened directly from a folder. Mobile installation and camera access require the project to be hosted through <strong>HTTPS</strong> or <strong>localhost</strong>.</p>
        <ol>
          <li>Upload the project folder to Netlify, GitHub Pages, Firebase Hosting, or another HTTPS host.</li>
          <li>Open the hosted link on your phone.</li>
          <li>Use the browser’s install or Add to Home Screen option.</li>
        </ol>`;
    } else if (isIos()) {
      helpContent.innerHTML = `
        <p>On iPhone or iPad:</p>
        <ol>
          <li>Open this page in <strong>Safari</strong>.</li>
          <li>Tap the <strong>Share</strong> button.</li>
          <li>Choose <strong>Add to Home Screen</strong>.</li>
          <li>Tap <strong>Add</strong>.</li>
        </ol>`;
    } else if (isAndroid()) {
      helpContent.innerHTML = `
        <p>On Android:</p>
        <ol>
          <li>Open the browser menu.</li>
          <li>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
          <li>Confirm the installation.</li>
        </ol>`;
    } else {
      helpContent.innerHTML = `
        <p>Open the browser menu and choose <strong>Install Yearbook Quest</strong>, <strong>Install app</strong>, or <strong>Add to Home Screen</strong>.</p>`;
    }

    helpModal.hidden = false;
    requestAnimationFrame(() => helpModal.classList.add('is-open'));
  }

  function closeHelpModal() {
    if (!helpModal || helpModal.hidden) return;
    helpModal.classList.remove('is-open');
    setTimeout(() => { helpModal.hidden = true; }, 170);
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    showInstallButton();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    hideInstallButton();
    if (typeof showToast === 'function') showToast('Yearbook Quest was installed successfully.');
  });

  installButton?.addEventListener('click', async () => {
    if (isStandalone()) {
      hideInstallButton();
      return;
    }

    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      return;
    }

    openHelpModal();
  });

  helpModal?.querySelectorAll('[data-install-action="close"]').forEach((element) => {
    element.addEventListener('click', closeHelpModal);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && helpModal && !helpModal.hidden) closeHelpModal();
  });

  if ('serviceWorker' in navigator && isSecureInstallContext()) {
    window.addEventListener('load', async () => {
      try {
        const registration = await navigator.serviceWorker.register('./service-worker.js', { scope: './' });

        if (registration.waiting && updateBanner) updateBanner.hidden = false;

        registration.addEventListener('updatefound', () => {
          const installingWorker = registration.installing;
          installingWorker?.addEventListener('statechange', () => {
            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller && updateBanner) {
              updateBanner.hidden = false;
            }
          });
        });
      } catch (error) {
        console.warn('Yearbook Quest service worker registration failed.', error);
      }
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }

  reloadButton?.addEventListener('click', async () => {
    const registration = await navigator.serviceWorker?.getRegistration('./');
    registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
  });

  if (!isStandalone()) {
    if (isIos() || location.protocol === 'file:') showInstallButton();
    window.setTimeout(showInstallButton, 1800);
  }
})();
