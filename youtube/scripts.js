// ==UserScript==
// @name        YouTube Recommendations Panel Toggle
// @namespace   http://example.com/
// @version     0.1
// @description Toggle the recommendations panel on YouTube video pages
// @match       https://www.youtube.com/*
// @grant       none
// ==/UserScript==

(() => {
  'use strict';

  const config = {
    buttonId: 'youtube-secondary-toggle-button',
    panelSelector: 'ytd-watch-flexy #secondary',
    fullscreenSelector: 'ytd-watch-flexy[fullscreen], .html5-video-player.ytp-fullscreen',
    storageKey: 'youtube-secondary-panel-hidden',
    checkDelay: 150,
    resizeDelays: [0, 80, 240],
  };

  let isHidden = localStorage.getItem(config.storageKey) === 'true';
  let button = null;
  let observer = null;
  let applyTimeout = null;

  const isWatchPage = () => location.pathname === '/watch';

  const findPanel = () => document.querySelector(config.panelSelector);

  const isVideoFullscreen = () => Boolean(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.querySelector(config.fullscreenSelector)
  );

  const updateButtonVisibility = () => {
    if (button) {
      button.style.display = isVideoFullscreen() ? 'none' : '';
    }
  };

  const forceYouTubeLayout = () => {
    const watchFlexy = document.querySelector('ytd-watch-flexy');

    if (watchFlexy && typeof watchFlexy.updateStyles === 'function') {
      watchFlexy.updateStyles();
    }

    requestAnimationFrame(() => {
      // Touching layout before resize helps YouTube notice the width change immediately.
      void document.documentElement.offsetWidth;

      config.resizeDelays.forEach(delay => {
        setTimeout(() => {
          window.dispatchEvent(new Event('resize'));
        }, delay);
      });
    });
  };

  const setPanelVisibility = () => {
    const panel = findPanel();
    if (panel) {
      const nextDisplay = isHidden ? 'none' : '';
      const changed = panel.style.display !== nextDisplay;

      panel.style.display = nextDisplay;

      if (changed) {
        forceYouTubeLayout();
      }
    }

    if (button) {
      const label = isHidden ? 'Show recommendations' : 'Hide recommendations';
      const pressed = String(isHidden);

      if (button.textContent !== label) {
        button.textContent = label;
      }
      if (button.getAttribute('aria-pressed') !== pressed) {
        button.setAttribute('aria-pressed', pressed);
      }
      if (button.dataset.hidden !== pressed) {
        button.dataset.hidden = pressed;
      }

      updateButtonVisibility();
    }
  };

  const scheduleApply = () => {
    clearTimeout(applyTimeout);
    applyTimeout = setTimeout(setPanelVisibility, config.checkDelay);
  };

  const togglePanel = () => {
    isHidden = !isHidden;
    localStorage.setItem(config.storageKey, String(isHidden));
    setPanelVisibility();
  };

  const createButton = () => {
    const nextButton = document.createElement('button');
    nextButton.id = config.buttonId;
    nextButton.type = 'button';
    nextButton.addEventListener('click', togglePanel);
    nextButton.style.cssText = `
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 2147483647;
      min-width: 168px;
      border: 1px solid rgba(255, 255, 255, 0.22);
      border-radius: 6px;
      padding: 10px 12px;
      background: rgba(15, 15, 15, 0.92);
      color: #fff;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.26);
      cursor: pointer;
      font: 500 13px/1.2 Arial, sans-serif;
    `;
    return nextButton;
  };

  const ensureButton = () => {
    if (!isWatchPage()) {
      if (button) {
        button.remove();
        button = null;
      }
      return;
    }

    if (!button) {
      button = document.getElementById(config.buttonId) || createButton();
      document.body.appendChild(button);
    }

    setPanelVisibility();
  };

  const startObserver = () => {
    if (observer) return;

    observer = new MutationObserver(scheduleApply);
    observer.observe(document.documentElement, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ['class', 'fullscreen'],
    });
  };

  const handleNavigation = () => {
    ensureButton();
    scheduleApply();
  };

  const wrapHistoryMethod = methodName => {
    const original = history[methodName];
    history[methodName] = function wrappedHistoryMethod(...args) {
      const result = original.apply(this, args);
      window.dispatchEvent(new Event('youtube-secondary-toggle:navigation'));
      return result;
    };
  };

  wrapHistoryMethod('pushState');
  wrapHistoryMethod('replaceState');

  window.addEventListener('popstate', handleNavigation);
  window.addEventListener('yt-navigate-finish', handleNavigation);
  window.addEventListener('youtube-secondary-toggle:navigation', handleNavigation);
  document.addEventListener('fullscreenchange', updateButtonVisibility);
  document.addEventListener('webkitfullscreenchange', updateButtonVisibility);

  ensureButton();
  startObserver();
  scheduleApply();
})();
