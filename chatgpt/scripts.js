
// ==UserScript==
// @name         ChatGPT Bulk Chat Deleter (Refactored)
// @namespace    http://example.com/
// @version      0.2
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
      menuLabel: '.__menu-label',
      menuItem: '#history .__menu-item .truncate'
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
      toggleButton: `
        margin-left: 8px;
        background: transparent;
        color: #000;
        border: 1px solid #888;
        padding: 2px 6px;
        font-size: 12px;
        cursor: pointer;
        border-radius: 4px;
      `,
      deleteButton: `
        margin: 10px 0 10px 10px;
        background-color: #c00;
        color: #fff;
        border: none;
        padding: 6px 12px;
        border-radius: 4px;
        font-weight: bold;
        cursor: pointer;
      `,
      checkbox: 'margin-right: 5px;'
    }
  };

  class BulkDeleter {
    constructor() {
      this.deleteMode = false;
      this.deleteBtn = null;
      this.lastChecked = null;
      this.toggleBtn = null;
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
      button.addEventListener('click', () => this.toggleDeleteMode());
      return button;
    }

    createDeleteButton() {
      const button = document.createElement('button');
      button.textContent = 'Delete selected';
      button.style.cssText = CONFIG.STYLES.deleteButton;
      button.addEventListener('click', () => this.handleDelete());
      return button;
    }

    toggleDeleteMode() {
      this.deleteMode = !this.deleteMode;
      this.toggleCheckBoxes(this.deleteMode);
      this.manageDeleteButton();
    }

    manageDeleteButton() {
      const header = document.querySelector(CONFIG.SELECTORS.menuLabel);
      if (!header) return;

      if (this.deleteMode && !this.deleteBtn) {
        this.deleteBtn = this.createDeleteButton();
        header.after(this.deleteBtn);
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

    toggleCheckBoxes(show) {
      const chatItems = document.querySelectorAll(CONFIG.SELECTORS.menuItem);

      chatItems.forEach((chat) => {
        let checkbox = chat.querySelector('input[type="checkbox"]');

        if (show && !checkbox) {
          checkbox = this.createCheckbox();
          chat.prepend(checkbox);
        } else if (!show && checkbox) {
          checkbox.remove();
        }
      });
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
        const sidebar = await this.waitForElement(CONFIG.SELECTORS.history);
        const header = sidebar.querySelector(CONFIG.SELECTORS.menuLabel);

        if (!header) {
          console.warn('Chat history header not found');
          return;
        }

        // Prevent duplicate initialization
        if (document.getElementById('bulk-delete-toggle-btn')) {
          console.log('Bulk deleter already initialized');
          return;
        }

        this.toggleBtn = this.createToggleButton();
        header.appendChild(this.toggleBtn);

        console.log('ChatGPT Bulk Deleter initialized successfully');
      } catch (error) {
        console.error('Failed to initialize bulk deleter:', error);
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
