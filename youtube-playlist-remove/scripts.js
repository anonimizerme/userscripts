// ==UserScript==
// @name        YouTube Playlist One-Click Remove
// @namespace   http://example.com/
// @version     1.1
// @description Adds a one-click remove button to videos on YouTube playlist pages
// @match       https://www.youtube.com/*
// @grant       none
// ==/UserScript==

(() => {
  'use strict';

  const config = {
    rowSelector: 'ytd-playlist-video-renderer',
    menuRendererSelector: 'ytd-menu-renderer',
    menuButtonSelector: 'button#button',
    removeButtonClass: 'yt-playlist-one-click-remove',
    busyClass: 'yt-playlist-one-click-remove-busy',
    styleId: 'yt-playlist-one-click-remove-styles',
    menuTimeout: 2500,
    scanDelay: 100,
  };

  const labels = {
    remove: 'Remove from playlist',
    busy: 'Removing from playlist…',
    error: 'Could not find YouTube’s remove command',
  };

  let scanTimeout = null;
  let removalInProgress = false;

  const isPlaylistPage = () => location.pathname === '/playlist';

  const addStyles = () => {
    if (document.getElementById(config.styleId)) return;

    const style = document.createElement('style');
    style.id = config.styleId;
    style.textContent = `
      .${config.removeButtonClass} {
        display: inline-flex;
        flex: 0 0 auto;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        margin: 0;
        padding: 8px;
        border: 0;
        border-radius: 50%;
        background: transparent;
        color: var(--yt-spec-icon-inactive, #606060);
        cursor: pointer;
        opacity: .78;
      }

      html[dark] .${config.removeButtonClass} {
        color: var(--yt-spec-icon-inactive, #aaa);
      }

      .${config.removeButtonClass}:hover,
      .${config.removeButtonClass}:focus-visible {
        background: var(--yt-spec-badge-chip-background, rgba(0, 0, 0, .1));
        color: var(--yt-spec-call-to-action, #065fd4);
        opacity: 1;
        outline: none;
      }

      .${config.removeButtonClass}:disabled {
        cursor: default;
        opacity: .35;
      }

      .${config.removeButtonClass}[data-error="true"] {
        color: var(--yt-spec-themed-blue, #c00);
        opacity: 1;
      }

      .${config.removeButtonClass} svg {
        display: block;
        width: 24px;
        height: 24px;
        fill: currentColor;
        pointer-events: none;
      }

      /*
       * The native menu still has to be rendered so its own remove command can
       * run. Keep that automatically opened menu invisible for the brief wait.
       */
      html.${config.busyClass} ytd-popup-container tp-yt-iron-dropdown {
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `;

    (document.head || document.documentElement).appendChild(style);
  };

  const setButtonLabel = (button, label) => {
    button.title = label;
    button.setAttribute('aria-label', label);
  };

  const createRemoveButton = row => {
    const button = document.createElement('button');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

    button.type = 'button';
    button.className = config.removeButtonClass;
    setButtonLabel(button, labels.remove);

    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    path.setAttribute(
      'd',
      'M19 3h-4V2a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v1H5a2 2 0 0 0-2 2h18a2 2 0 0 0-2-2ZM6 19V7H4v12a4 4 0 0 0 4 4h8a4 4 0 0 0 4-4V7h-2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2Zm4-11a1 1 0 0 0-1 1v8a1 1 0 1 0 2 0V9a1 1 0 0 0-1-1Zm4 0a1 1 0 0 0-1 1v8a1 1 0 0 0 2 0V9a1 1 0 0 0-1-1Z'
    );
    svg.appendChild(path);
    button.appendChild(svg);

    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      removeRow(row, button);
    });
    return button;
  };

  const enhancePlaylistRows = () => {
    if (!isPlaylistPage()) {
      document.querySelectorAll(`.${config.removeButtonClass}`).forEach(button => button.remove());
      return;
    }

    addStyles();

    document.querySelectorAll(config.rowSelector).forEach(row => {
      if (row.querySelector(`.${config.removeButtonClass}`)) return;

      const menuRenderer = row.querySelector(config.menuRendererSelector);
      if (!menuRenderer?.parentElement) return;

      menuRenderer.parentElement.insertBefore(createRemoveButton(row), menuRenderer);
    });
  };

  const scheduleScan = () => {
    clearTimeout(scanTimeout);
    scanTimeout = setTimeout(enhancePlaylistRows, config.scanDelay);
  };

  const getRendererData = renderer =>
    renderer.data ||
    renderer.__data?.data ||
    renderer.__dataHost?.data ||
    null;

  const hasDeleteRendererData = renderer => {
    const data = getRendererData(renderer);
    return data?.icon?.iconType === 'DELETE';
  };

  const hasTrashIcon = renderer =>
    [...renderer.querySelectorAll('svg path')].some(path =>
      path.getAttribute('d')?.replace(/\s+/g, '').startsWith('M193h-4V2')
    );

  const hasRemoveLabel = renderer => {
    const label = renderer.textContent.replace(/\s+/g, ' ').trim();
    return /\bremove from\b|удалить из/i.test(label);
  };

  const isVisibleMenuItem = renderer => {
    if (!renderer.isConnected || renderer.hidden) return false;
    if (renderer.closest('[aria-hidden="true"]')) return false;

    const dropdown = renderer.closest('tp-yt-iron-dropdown, ytd-menu-popup-renderer');
    if (!dropdown) return false;

    const style = getComputedStyle(dropdown);
    return style.display !== 'none' && style.visibility !== 'hidden';
  };

  const findNativeRemoveItem = () => {
    const renderers = [
      ...document.querySelectorAll(
        'ytd-popup-container ytd-menu-service-item-renderer'
      ),
    ].filter(isVisibleMenuItem);

    return (
      renderers.find(hasDeleteRendererData) ||
      renderers.find(hasTrashIcon) ||
      renderers.find(hasRemoveLabel) ||
      null
    );
  };

  const waitForNativeRemoveItem = () =>
    new Promise((resolve, reject) => {
      let observer;
      let timeout;

      const finish = (callback, value) => {
        observer?.disconnect();
        clearTimeout(timeout);
        callback(value);
      };

      const check = () => {
        const renderer = findNativeRemoveItem();
        if (renderer) finish(resolve, renderer);
      };

      observer = new MutationObserver(check);
      observer.observe(document.body, { childList: true, subtree: true });
      timeout = setTimeout(
        () => finish(reject, new Error(labels.error)),
        config.menuTimeout
      );
      check();
    });

  const setAllRemoveButtonsDisabled = disabled => {
    document.querySelectorAll(`.${config.removeButtonClass}`).forEach(button => {
      button.disabled = disabled;
      const label = disabled
        ? labels.busy
        : button.dataset.error === 'true'
          ? labels.error
          : labels.remove;
      setButtonLabel(button, label);
    });
  };

  const closeNativeMenu = () => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        bubbles: true,
        cancelable: true,
      })
    );
  };

  const showTemporaryError = button => {
    if (!button.isConnected) return;

    button.dataset.error = 'true';
    setButtonLabel(button, labels.error);

    setTimeout(() => {
      if (!button.isConnected) return;
      delete button.dataset.error;
      setButtonLabel(button, labels.remove);
    }, 2500);
  };

  async function removeRow(row, button) {
    if (removalInProgress || !row.isConnected) return;

    const nativeMenuButton = row.querySelector(
      `${config.menuRendererSelector} ${config.menuButtonSelector}`
    );

    if (!nativeMenuButton) {
      showTemporaryError(button);
      console.warn('[YouTube Playlist One-Click Remove] Action menu button not found.');
      return;
    }

    removalInProgress = true;
    setAllRemoveButtonsDisabled(true);
    document.documentElement.classList.add(config.busyClass);

    try {
      nativeMenuButton.click();
      const renderer = await waitForNativeRemoveItem();
      const nativeRemoveItem =
        renderer.querySelector('tp-yt-paper-item[role="menuitem"]') || renderer;
      nativeRemoveItem.click();
    } catch (error) {
      closeNativeMenu();
      showTemporaryError(button);
      console.warn('[YouTube Playlist One-Click Remove]', error);
    } finally {
      document.documentElement.classList.remove(config.busyClass);
      removalInProgress = false;
      setAllRemoveButtonsDisabled(false);
    }
  }

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  window.addEventListener('yt-navigate-finish', scheduleScan);
  window.addEventListener('popstate', scheduleScan);

  enhancePlaylistRows();
})();
