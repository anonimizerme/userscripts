
// ==UserScript==
// @name         ChatGPT Bulk Chat Deleter
// @namespace    http://example.com/
// @version      0.4
// @description  Add checkboxes to ChatGPT chats for bulk deletion
// @match        https://chatgpt.com/*
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  // Configuration
  const CONFIG = {
    SELECTORS: {
      history: '#history',
      historyContainer: 'nav[aria-label="Chat history"]',
      menuLabel: '.__menu-label',
      menuItem: '#history a.__menu-item[href*="/c/"]'
    },
    TIMEOUTS: {
      element: 3000,
      interval: 300
    },
    API: {
      concurrency: 5,
      endpoint: 'https://chatgpt.com/backend-api/conversation',
      authEndpoint: '/api/auth/session'
    },
    STYLES: {
      container: `
        padding: 8px 12px;
        margin-bottom: 8px;
        background: rgba(0, 0, 0, 0.05);
        border-radius: 8px;
        display: flex;
        gap: 8px;
        align-items: center;
        justify-content: space-between;
      `,
      toggleButton: `
        background: rgba(255, 255, 255, 0.1);
        color: inherit;
        border: 1px solid rgba(0, 0, 0, 0.1);
        padding: 4px 8px;
        font-size: 11px;
        cursor: pointer;
        border-radius: 4px;
        transition: all 0.2s;
        font-weight: 500;
        white-space: nowrap;
      `,
      toggleButtonActive: `
        background: rgba(0, 0, 0, 0.1);
        border-color: rgba(0, 0, 0, 0.2);
      `,
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
      deleteButtonHover: `
        background: #dc2626;
      `,
      checkbox: `
        flex: 0 0 auto;
        margin: 0;
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

    async waitForElement(selector, timeout = CONFIG.TIMEOUTS.element) {
      return new Promise((resolve, reject) => {
        const interval = CONFIG.TIMEOUTS.interval;
        let elapsed = 0;

        const check = () => {
          const element = document.querySelector(selector);
          if (element) return resolve(element);

          elapsed += interval;
          if (elapsed >= timeout) {
            return reject(new Error(`Timeout: ${selector} not found after ${timeout}ms`));
          }

          setTimeout(check, interval);
        };
        check();
      });
    }

    createToggleButton() {
      const button = document.createElement('button');
      button.id = 'bulk-delete-toggle-btn';
      button.textContent = '🗑️ Bulk';
      button.style.cssText = CONFIG.STYLES.toggleButton;
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.toggleDeleteMode();
      });
      button.addEventListener('mouseenter', () => {
        if (!this.deleteMode) {
          button.style.background = 'rgba(0, 0, 0, 0.08)';
        }
      });
      button.addEventListener('mouseleave', () => {
        if (!this.deleteMode) {
          button.style.background = 'rgba(255, 255, 255, 0.1)';
        }
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
      const container = document.createElement('div');
      container.id = 'bulk-delete-container';
      container.style.cssText = CONFIG.STYLES.container;
      return container;
    }

    toggleDeleteMode() {
      this.deleteMode = !this.deleteMode;
      this.toggleCheckBoxes(this.deleteMode);
      this.manageDeleteButton();

      // Update toggle button style
      if (this.deleteMode) {
        this.toggleBtn.style.cssText = CONFIG.STYLES.toggleButton + CONFIG.STYLES.toggleButtonActive;
        this.startObserving();
      } else {
        this.toggleBtn.style.cssText = CONFIG.STYLES.toggleButton;
        this.stopObserving();
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

      const content = chatItem.querySelector(':scope > div:first-child');
      if (content) content.prepend(this.createCheckbox());
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
              const chatItems = node.matches && node.matches('a.__menu-item[href*="/c/"]')
                ? [node]
                : node.querySelectorAll ? node.querySelectorAll('a.__menu-item[href*="/c/"]') : [];

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

    async deleteChatBatch(chatData, accessToken) {
      const promises = chatData.map(({ chat, chatId }) =>
        this.deleteChat(chatId, accessToken)
          .then(() => {
            chat.remove();
            console.log(`Chat ${chatId} deleted successfully`);
          })
          .catch(error => {
            console.error(`Failed to delete chat ${chatId}:`, error);
          })
      );

      return Promise.allSettled(promises);
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

      // Process in batches
      for (let i = 0; i < chatData.length; i += CONFIG.API.concurrency) {
        const batch = chatData.slice(i, i + CONFIG.API.concurrency);
        await this.deleteChatBatch(batch, accessToken);
      }

      console.log(`Bulk deletion completed for ${chatData.length} chats`);
    }

    async init() {
      try {
        console.log('[Bulk Deleter] Starting initialization...');

        // Prevent duplicate initialization
        if (document.getElementById('bulk-delete-container')) {
          console.log('[Bulk Deleter] Already initialized');
          return;
        }

        // Wait for history container
        await this.waitForElement(CONFIG.SELECTORS.history);
        console.log('[Bulk Deleter] History element found');

        const historyEl = document.querySelector(CONFIG.SELECTORS.history);
        if (!historyEl) {
          console.error('[Bulk Deleter] History element not found');
          return;
        }

        // Create container and button
        this.container = this.createContainer();
        this.toggleBtn = this.createToggleButton();

        // Add button to container
        this.container.appendChild(this.toggleBtn);

        // Insert container before history
        historyEl.before(this.container);

        console.log('[Bulk Deleter] ✓ Initialized successfully');
      } catch (error) {
        console.error('[Bulk Deleter] Failed to initialize:', error);
      }
    }
  }

  // Initialize when DOM is ready
  const initializeBulkDeleter = async () => {
    try {
      await new Promise(resolve => {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', resolve);
        } else {
          resolve();
        }
      });

      const bulkDeleter = new BulkDeleter();
      await bulkDeleter.init();
    } catch (error) {
      console.error('Error initializing ChatGPT Bulk Deleter:', error);
    }
  };

  // Start the script
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeBulkDeleter);
  } else {
    initializeBulkDeleter();
  }
})();
