// ==UserScript==
// @name        Safari Hotkey Link Navigation (Refactored)
// @namespace   http://example.com/
// @version     1.12
// @description Navigate links using hotkeys in Safari (Refactored version)
// @match       *://*/*
// @grant       none
// ==/UserScript==

(() => {
  'use strict';

  // Configuration for the script
  const config = {
    hintChars: ['a', 's', 'd', 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', 'z', 'x', 'c', 'v', 'b', 'n', 'm'],
    hintKey: 'f',
    hintKeyCode: 70,
    scrollLines: 10,
    backgroundColor: 'yellow',
    textColor: 'black',
    fontSize: '12px',
    fontFamily: 'Monospace',
    keyCodeMap: {
      65: 'a', 83: 's', 68: 'd', 81: 'q', 87: 'w', 69: 'e', 82: 'r', 84: 't', 89: 'y', 85: 'u', 73: 'i',
      79: 'o', 80: 'p', 90: 'z', 88: 'x', 67: 'c', 86: 'v', 66: 'b', 78: 'n', 77: 'm',
      74: 'j', 75: 'k'
    }
  };

  let linkHints = [];
  let hintTimeout;
  let hintsActive = false;
  let typedKeys = '';

  // Recursively query elements (including those in shadow DOM)
  const queryAllElementsDeep = (selector, root = document) => {
    const elements = Array.from(root.querySelectorAll(selector));
    const shadowHosts = Array.from(root.querySelectorAll('*')).filter(el => el.shadowRoot);
    shadowHosts.forEach(host => elements.push(...queryAllElementsDeep(selector, host.shadowRoot)));
    return elements;
  };

  // Check if an element is at least partially visible
  const isElementVisible = element => {
    const rect = element.getBoundingClientRect();
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < (window.innerHeight || document.documentElement.clientHeight) &&
      rect.left < (window.innerWidth || document.documentElement.clientWidth)
    );
  };

  // Determine if an element is obscured
  const isElementObscured = element => {
    const rect = element.getBoundingClientRect();
    const elementFromPoint = document.elementFromPoint(rect.left, rect.top);
    return !(element.contains(elementFromPoint) || elementFromPoint?.contains?.(element));
  };

  // Generate a hint string based on index
  const createHintText = index => {
    const { hintChars } = config;
    if (index >= hintChars.length * hintChars.length) return null;
    const firstChar = hintChars[Math.floor(index / hintChars.length)];
    const secondChar = hintChars[index % hintChars.length];
    return firstChar + secondChar;
  };

  // Create and position the hint element on the page
  const createHintElement = (link, hintString) => {
    const hintEl = document.createElement('span');
    const rect = link.getBoundingClientRect();
    Object.assign(hintEl.style, {
      position: 'absolute',
      top: `${rect.top + window.scrollY}px`,
      left: `${rect.left + window.scrollX}px`,
      backgroundColor: config.backgroundColor,
      color: config.textColor,
      padding: '2px 4px',
      fontSize: config.fontSize,
      fontFamily: config.fontFamily,
      zIndex: '10000',
      borderRadius: '3px'
    });
    hintEl.textContent = hintString;
    document.body.appendChild(hintEl);
    hintEl.linkElement = link;
    return hintEl;
  };

  // Generate link hints for visible elements
  const generateLinkHints = () => {
    clearHints();
    const rawLinks = queryAllElementsDeep('a, button, [role="button"], input[type="text"], textarea, select');
    if (!rawLinks.length) return;

    // Filter out non-visible, obscured, or unwanted elements (e.g. role="button" with an <a> inside)
    const validLinks = rawLinks.filter(link => {
      if (link.getAttribute('role') === 'button' && link.querySelector('a')) return false;
      return isElementVisible(link) && !isElementObscured(link);
    });

    linkHints = validLinks.map((link, index) => {
      const hintText = createHintText(index);
      if (!hintText) return null;
      const hintEl = createHintElement(link, hintText);
      return { element: hintEl, text: hintText.toLowerCase() };
    }).filter(hint => hint !== null);

    if (linkHints.length > 0) {
      document.body.classList.add('hotkey-link-hints-active');
      hintsActive = true;
      typedKeys = '';
    }
  };

  // Remove all hint elements from the DOM
  const clearHints = () => {
    linkHints.forEach(hintObj => {
      if (hintObj && hintObj.element && hintObj.element.parentNode) {
        hintObj.element.parentNode.removeChild(hintObj.element);
      }
    });
    linkHints = [];
    document.body.classList.remove('hotkey-link-hints-active');
    hintsActive = false;
    typedKeys = '';
  };

  // Checks if an element is an editable field
  const isEditableElement = element =>
    element?.tagName === 'INPUT' ||
    element?.tagName === 'TEXTAREA' ||
    element?.isContentEditable ||
    element?.getAttribute?.('contenteditable') === 'true';

  // Simulate clicking the link element
  const triggerLink = linkElement => {
    clearHints();
    if (!linkElement) {
      console.error("triggerLink called with null linkElement");
      return;
    }
    try {
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window,
      });
      linkElement.dispatchEvent(clickEvent);
    } catch (error) {
      console.error("Error triggering link:", error);
      linkElement.click();
    }
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(linkElement.tagName)) {
      linkElement.focus();
    }
  };

  // Keydown event handler for activating hints, scrolling, and link triggering
  const handleKeyDown = event => {
    const path = event.composedPath ? event.composedPath() : [event.target];
    if (path.some(isEditableElement)) return;

    const target = event.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' ||
      target.isContentEditable || target.getAttribute('contenteditable') === 'true')) {
      return;
    }

    const key = event.key.toLowerCase();
    if (event.metaKey) return;

    if (key === 'escape' && hintsActive) {
      clearHints();
      event.preventDefault();
      return;
    }

    // Activate hints with the configured key
    if (key === config.hintKey || event.keyCode === config.hintKeyCode) {
      hintsActive ? clearHints() : generateLinkHints();
      event.preventDefault();
      return;
    }

    // Scroll down/up using 'j' and 'k'
    if (key === 'j' || event.keyCode === 74) {
      window.scrollBy({ top: config.scrollLines * 16, behavior: 'smooth' });
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (key === 'k' || event.keyCode === 75) {
      window.scrollBy({ top: -config.scrollLines * 16, behavior: 'smooth' });
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    // Process hint keys if hints are active
    if (hintsActive && linkHints.length > 0) {
      if (key === 'backspace' || event.keyCode === 8) {
        typedKeys = typedKeys.slice(0, -1);
      } else if (config.keyCodeMap[event.keyCode]) {
        typedKeys += config.keyCodeMap[event.keyCode];
      } else {
        return;
      }

      const matchingHints = linkHints.filter(hintObj => hintObj.text.startsWith(typedKeys));

      // Update the visual state of each hint
      linkHints.forEach(hintObj => {
        const { element, text } = hintObj;
        if (typedKeys && text.startsWith(typedKeys)) {
          const boldEl = document.createElement('strong');
          boldEl.style.color = 'orange';
          boldEl.textContent = typedKeys;
          const remainingText = document.createTextNode(text.substring(typedKeys.length));
          element.innerHTML = '';
          element.appendChild(boldEl);
          element.appendChild(remainingText);
        } else {
          element.innerHTML = text;
          element.style.display = typedKeys ? 'none' : '';
        }
      });

      if (matchingHints.length === 1 && matchingHints[0].text === typedKeys) {
        clearTimeout(hintTimeout);
        hintTimeout = setTimeout(() => triggerLink(matchingHints[0].element.linkElement), 0);
        event.preventDefault();
        event.stopPropagation();
      }
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const handleKeyUp = () => {
    // No keyup logic required
  };

  // Clean up event listeners and hints
  const cleanup = () => {
    document.removeEventListener('keydown', handleKeyDown, true);
    document.removeEventListener('keyup', handleKeyUp, true);
    clearHints();
  };

  document.addEventListener('keydown', handleKeyDown, true);
  document.addEventListener('keyup', handleKeyUp, true);
  window.removeHotkeyListeners = cleanup;
})();
