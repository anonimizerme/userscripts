
// ==UserScript==
// @name         ChatGPT Bulk Chat Deleter
// @namespace    http://example.com/
// @version      0.10
// @description  Add checkboxes to ChatGPT chats for bulk deletion
// @match        https://chatgpt.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  // Configuration
  const CONFIG = {
    SELECTORS: {
      recentOptions: '[data-sidebar-project-container-id="chats"] button[aria-label="Chat sidebar options"]',
      history: 'nav[aria-label="Home"], nav[aria-label="Chat history"]',
      menuItem: 'nav[aria-label="Home"] a[data-interactive-row-link="true"][href*="/c/"], nav[aria-label="Chat history"] a[href*="/c/"]'
    },
    API: {
      concurrency: 5,
      endpoint: 'https://chatgpt.com/backend-api/conversation',
      authEndpoint: '/api/auth/session'
    },
    STYLES: {
      deleteButton: `
        background: #ef4444;
        color: #fff;
        border: none;
        padding: 4px 10px;
        border-radius: 4px;
        font-weight: 500;
        font-size: 11px;
        cursor: pointer;
        transition: all 0.2s;
        white-space: nowrap;
      `,
      checkbox: `
        appearance: auto;
        -webkit-appearance: checkbox;
        accent-color: #2563eb;
        flex: 0 0 auto;
        margin: 0 8px 0 0;
        width: 16px;
        height: 16px;
        cursor: pointer;
      `
    }
  };

  class BulkDeleter {
    constructor() {
      this.deleteMode = false;
      this.deleteBtn = null;
      this.lastChecked = null;
      this.toggleBtn = null;
      this.observer = null;
      this.container = null;
    }

    createToggleButton(template) {
      const button = document.createElement('button');
      button.id = 'bulk-delete-toggle-btn';
      button.type = 'button';
      button.title = 'Bulk delete chats';
      button.setAttribute('aria-label', 'Bulk delete chats');
      button.setAttribute('aria-pressed', 'false');
      button.className = template.className;
      for (const name of ['data-color', 'data-variant', 'data-uniform', 'data-size']) {
        if (template.hasAttribute(name)) button.setAttribute(name, template.getAttribute(name));
      }
      const icon = template.querySelector('svg')?.cloneNode(true);
      const use = icon?.querySelector('use');
      if (use?.getAttribute('href')) {
        use.setAttribute('href', use.getAttribute('href').split('#')[0] + '#codex-icon-trash-light-16');
        button.appendChild(icon);
      } else {
        button.textContent = '🗑️';
      }
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.toggleDeleteMode();
      });
      return button;
    }

    createDeleteButton() {
      const button = document.createElement('button');
      button.textContent = 'Delete';
      button.style.cssText = CONFIG.STYLES.deleteButton;
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.handleDelete();
      });
      button.addEventListener('mouseenter', () => {
        button.style.background = '#dc2626';
        button.style.transform = 'scale(1.02)';
      });
      button.addEventListener('mouseleave', () => {
        button.style.background = '#ef4444';
        button.style.transform = 'scale(1)';
      });
      return button;
    }

    createContainer() {
      const container = document.createElement('span');
      container.id = 'bulk-delete-container';
      container.className = 'flex items-center gap-1';
      return container;
    }

    toggleDeleteMode() {
      this.deleteMode = !this.deleteMode;
      this.toggleCheckBoxes(this.deleteMode);
      this.manageDeleteButton();

      this.toggleBtn.setAttribute('aria-pressed', String(this.deleteMode));
      // Keep the native hover controls visible while selection mode is active.
      this.toggleBtn.setAttribute('data-state', this.deleteMode ? 'open' : 'closed');
      this.toggleBtn.style.color = this.deleteMode ? '#ef4444' : '';
      if (this.deleteMode) {
        this.startObserving();
      } else {
        this.stopObserving();
        this.lastChecked = null;
      }
    }

    manageDeleteButton() {
      if (this.deleteMode && !this.deleteBtn) {
        this.deleteBtn = this.createDeleteButton();
        this.container.appendChild(this.deleteBtn);
      } else if (!this.deleteMode && this.deleteBtn) {
        this.deleteBtn.remove();
        this.deleteBtn = null;
      }
    }

    createCheckbox() {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.setAttribute('aria-label', 'Select chat for deletion');
      checkbox.className = 'bulk-delete-checkbox';
      checkbox.style.cssText = CONFIG.STYLES.checkbox;

      checkbox.addEventListener('click', (e) => this.handleCheckboxClick(e, checkbox));
      return checkbox;
    }

    handleCheckboxClick(event, checkbox) {
      event.stopPropagation();

      if (event.shiftKey && this.lastChecked) {
        this.selectRange(this.lastChecked, checkbox);
      }
      this.lastChecked = checkbox;
    }

    selectRange(start, end) {
      const checkboxes = Array.from(document.querySelectorAll('.bulk-delete-checkbox'));
      const startIndex = checkboxes.indexOf(start);
      const endIndex = checkboxes.indexOf(end);
      const [min, max] = [startIndex, endIndex].sort((a, b) => a - b);

      for (let i = min; i <= max; i++) {
        if (checkboxes[i]) {
          checkboxes[i].checked = true;
        }
      }
    }

    addCheckbox(chatItem) {
      if (chatItem.querySelector('.bulk-delete-checkbox')) return;

      chatItem.prepend(this.createCheckbox());
    }

    toggleCheckBoxes(show) {
      const chatItems = document.querySelectorAll(CONFIG.SELECTORS.menuItem);

      chatItems.forEach((chatItem) => {
        const checkbox = chatItem.querySelector('.bulk-delete-checkbox');

        if (show && !checkbox) {
          this.addCheckbox(chatItem);
        } else if (!show && checkbox) {
          checkbox.remove();
        }
      });
    }

    startObserving() {
      const historyElement = document.querySelector(CONFIG.SELECTORS.history);
      if (!historyElement) return;

      this.observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) {
              // Check if the added node is a chat item or contains chat items
              const chatItems = node.matches && node.matches(CONFIG.SELECTORS.menuItem)
                ? [node]
                : node.querySelectorAll ? node.querySelectorAll(CONFIG.SELECTORS.menuItem) : [];

              chatItems.forEach((chatItem) => this.addCheckbox(chatItem));
            }
          });
        });
      });

      this.observer.observe(historyElement, {
        childList: true,
        subtree: true
      });

      console.log('[Bulk Deleter] Started observing DOM changes');
    }

    stopObserving() {
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
        console.log('[Bulk Deleter] Stopped observing DOM changes');
      }
    }

    async getAccessToken() {
      try {
        const response = await fetch(CONFIG.API.authEndpoint);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        if (!data.accessToken) {
          throw new Error('Access token not found in response');
        }

        return data.accessToken;
      } catch (error) {
        console.error('Error getting access token:', error);
        return null;
      }
    }

    extractChatId(href) {
      if (!href) return null;
      const match = href.match(/\/c\/([^/?]+)/);
      return match ? match[1] : null;
    }

    async deleteChats(chatData, accessToken) {
      let next = 0;
      const worker = async () => {
        while (next < chatData.length) {
          const { chat, chatId } = chatData[next++];
          try {
            await this.deleteChat(chatId, accessToken);
            (chat.closest('[data-sidebar-chatgpt-conversation-key]') || chat).remove();
            console.log(`Chat ${chatId} deleted successfully`);
          } catch (error) {
            console.error(`Failed to delete chat ${chatId}:`, error);
          }
        }
      };

      await Promise.all(Array.from({ length: Math.min(CONFIG.API.concurrency, chatData.length) }, worker));
    }

    async deleteChat(chatId, accessToken) {
      const response = await fetch(`${CONFIG.API.endpoint}/${chatId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({ is_visible: false })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    }

    async handleDelete() {
      const checkedChats = Array.from(document.querySelectorAll('.bulk-delete-checkbox:checked'))
        .map(cb => cb.closest('a'))
        .filter(Boolean);

      if (!checkedChats.length) {
        alert('Please select chats to delete');
        return;
      }

      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        alert('Failed to get authorization token. Please try again.');
        return;
      }

      const confirmed = confirm(`Delete ${checkedChats.length} chat(s)?`);
      if (!confirmed) return;

      const chatData = checkedChats
        .map(chat => ({
          chat,
          chatId: this.extractChatId(chat.getAttribute('href'))
        }))
        .filter(item => item.chatId);

      if (!chatData.length) {
        alert('No valid chats found to delete');
        return;
      }

      await this.deleteChats(chatData, accessToken);

      console.log(`Bulk deletion completed for ${chatData.length} chats`);
    }

    mountControls() {
      if (this.container?.isConnected) return;
      const options = document.querySelector(CONFIG.SELECTORS.recentOptions);
      if (!options) return;

      if (!this.container) {
        this.container = this.createContainer();
        this.toggleBtn = this.createToggleButton(options);
        this.container.appendChild(this.toggleBtn);
      }
      // Append only to the client-rendered Recents actions, not the hydrating nav.
      options.parentElement.appendChild(this.container);
      this.stopObserving();
      if (this.deleteMode) {
        this.lastChecked = null;
        this.toggleCheckBoxes(true);
        this.startObserving();
      }
    }

    init() {
      if (document.getElementById('bulk-delete-container')) return;
      // A timer yields to ChatGPT; synchronous observer reinsertion can starve startup.
      setInterval(() => {
        try {
          this.mountControls();
        } catch (error) {
          console.error('[Bulk Deleter] Failed to attach controls:', error);
        }
      }, 1000);
    }
  }

  const initializeBulkDeleter = () => new BulkDeleter().init();

  // Start the script
  if (document.readyState === 'complete') {
    initializeBulkDeleter();
  } else {
    window.addEventListener('load', initializeBulkDeleter, { once: true });
  }
})();
