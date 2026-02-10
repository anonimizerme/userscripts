// ==UserScript==
// @name        Safari Hotkey Link Navigation
// @namespace   http://example.com/
// @version     1.13
// @description Navigate links using hotkeys in Safari
// @match       *://*/*
// @grant       none
// ==/UserScript==

(() => {
  'use strict';

  // Configuration for the script
  const config = {
    hintChars: ['a', 's', 'd', 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', 'z', 'x', 'c', 'v', 'b', 'n', 'm'],
    hintKey: 'f',
    scrollLines: 10,
    backgroundColor: 'yellow',
    textColor: 'black',
    fontSize: '12px',
    fontFamily: 'Monospace',
    refreshDelay: 100,
  };

  let linkHints = [];
  let hintTimeout;
  let refreshTimeout;
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
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
    const safePoint = (x, y) => ({
      x: clamp(x, 0, Math.max(0, viewportWidth - 1)),
      y: clamp(y, 0, Math.max(0, viewportHeight - 1))
    });
    const offsetX = Math.min(2, rect.width / 2);
    const offsetY = Math.min(2, rect.height / 2);
    const points = [
      safePoint(rect.left + offsetX, rect.top + offsetY),
      safePoint(rect.right - offsetX, rect.bottom - offsetY),
      safePoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    ];
    return !points.some(({ x, y }) => {
      const elementFromPoint = document.elementFromPoint(x, y);
      return elementFromPoint && (element.contains(elementFromPoint) || elementFromPoint.contains(element));
    });
  };

  const buildHintScheme = totalCount => {
    const baseChars = config.hintChars;
    const base = baseChars.length;
    if (totalCount <= base) {
      return {
        baseChars,
        singleChars: baseChars.slice(0, totalCount),
        prefixChars: [],
        singleCount: totalCount
      };
    }

    const minSingles = base > 1 ? 1 : 0;
    let best = null;

    for (let singleCount = base - 1; singleCount >= minSingles; singleCount -= 1) {
      const prefixCount = base - singleCount;
      const multiCount = totalCount - singleCount;
      if (multiCount <= 0) {
        best = { singleCount, maxLen: 1 };
        break;
      }
      if (prefixCount <= 0) continue;

      let capacity = 0;
      let maxLen = 1;
      let bucket = prefixCount * base; // length 2
      maxLen = 2;
      capacity += bucket;
      while (capacity < multiCount) {
        maxLen += 1;
        bucket *= base;
        capacity += bucket;
      }

      if (!best || maxLen < best.maxLen || (maxLen === best.maxLen && singleCount > best.singleCount)) {
        best = { singleCount, maxLen };
      }
    }

    if (!best) {
      return {
        baseChars,
        singleChars: baseChars.slice(0, Math.min(base, totalCount)),
        prefixChars: baseChars.slice(Math.min(base, totalCount)),
        singleCount: Math.min(base, totalCount)
      };
    }

    return {
      baseChars,
      singleChars: baseChars.slice(0, best.singleCount),
      prefixChars: baseChars.slice(best.singleCount),
      singleCount: best.singleCount
    };
  };

  // Generate a hint string based on index and scheme
  const createHintText = (index, scheme) => {
    const { singleChars, prefixChars, baseChars, singleCount } = scheme;
    if (index < singleCount) return singleChars[index].toLowerCase();

    const base = baseChars.length;
    const prefixBase = prefixChars.length;
    if (prefixBase === 0) return null;

    let remaining = index - singleCount;
    let length = 2;
    let bucketSize = prefixBase * base; // length 2
    while (remaining >= bucketSize) {
      remaining -= bucketSize;
      length += 1;
      bucketSize *= base;
    }

    const suffixBasePow = base ** (length - 1);
    const prefixIndex = Math.floor(remaining / suffixBasePow);
    let hint = prefixChars[prefixIndex];
    let rest = remaining % suffixBasePow;

    for (let i = 0; i < length - 1; i += 1) {
      const power = base ** (length - 2 - i);
      const digit = Math.floor(rest / power);
      hint += baseChars[digit];
      rest %= power;
    }

    return hint.toLowerCase();
  };

  // Create and position the hint element on the page
  const setHintPosition = (hintEl, link) => {
    const rect = link.getBoundingClientRect();
    hintEl.style.top = `${rect.top + window.scrollY}px`;
    hintEl.style.left = `${rect.left + window.scrollX}px`;
  };

  const createHintElement = (link, hintString) => {
    const hintEl = document.createElement('span');
    Object.assign(hintEl.style, {
      position: 'absolute',
      backgroundColor: config.backgroundColor,
      color: config.textColor,
      padding: '2px 4px',
      fontSize: config.fontSize,
      fontFamily: config.fontFamily,
      zIndex: '2147483647',
      pointerEvents: 'none',
      borderRadius: '3px'
    });
    hintEl.textContent = hintString;
    setHintPosition(hintEl, link);
    return hintEl;
  };

  // Generate link hints for visible elements
  const generateLinkHints = () => {
    clearHints();
    const rawLinks = queryAllElementsDeep(
      'a, button, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"]), input:not([type="hidden"]), textarea, select'
    );
    if (!rawLinks.length) return;

    // Filter out non-visible, obscured, or unwanted elements (e.g. role="button" with an <a> inside)
    const validLinks = rawLinks.filter(link => {
      if (link.matches('[disabled], [aria-hidden="true"]')) return false;
      if (link.closest('[aria-hidden="true"]')) return false;
      if (link.getAttribute('role') === 'button' && link.querySelector('a')) return false;
      return isElementVisible(link) && !isElementObscured(link);
    });

    if (!validLinks.length) return;

    const hintScheme = buildHintScheme(validLinks.length);
    const fragment = document.createDocumentFragment();
    linkHints = validLinks.map((link, index) => {
      const hintText = createHintText(index, hintScheme);
      if (!hintText) return null;
      const hintEl = createHintElement(link, hintText);
      fragment.appendChild(hintEl);
      return {
        element: hintEl,
        text: hintText,
        linkElement: link,
        inViewport: true
      };
    }).filter(Boolean);

    if (linkHints.length > 0) {
      document.body.appendChild(fragment);
      document.body.classList.add('hotkey-link-hints-active');
      hintsActive = true;
      typedKeys = '';
      updateHintPositions();
      updateHintVisuals();
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
    if (hintTimeout) {
      clearTimeout(hintTimeout);
      hintTimeout = null;
    }
    if (refreshTimeout) {
      clearTimeout(refreshTimeout);
      refreshTimeout = null;
    }
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
  const isHintToggleKey = event => {
    const key = (event.key || '').toLowerCase();
    const code = event.code || '';
    return key === config.hintKey || code === `Key${config.hintKey.toUpperCase()}`;
  };

  const getHintKey = event => {
    const key = (event.key || '').toLowerCase();
    if (key.length === 1 && config.hintChars.includes(key)) return key;
    const code = event.code || '';
    if (code.startsWith('Key')) {
      const physicalKey = code.slice(3).toLowerCase();
      if (config.hintChars.includes(physicalKey)) return physicalKey;
    }
    return null;
  };

  const updateHintPositions = () => {
    if (!hintsActive) return;
    linkHints.forEach(hintObj => {
      const linkElement = hintObj.linkElement;
      if (!linkElement || !linkElement.isConnected) {
        hintObj.inViewport = false;
        return;
      }
      if (!isElementVisible(linkElement) || isElementObscured(linkElement)) {
        hintObj.inViewport = false;
        return;
      }
      hintObj.inViewport = true;
      setHintPosition(hintObj.element, linkElement);
    });
  };

  const updateHintVisuals = () => {
    const matchingHints = linkHints.filter(hintObj => hintObj.text.startsWith(typedKeys));

    linkHints.forEach(hintObj => {
      const { element, text, inViewport } = hintObj;
      const matchesTyped = typedKeys && text.startsWith(typedKeys);
      if (matchesTyped) {
        const boldEl = document.createElement('strong');
        boldEl.style.color = 'orange';
        boldEl.textContent = typedKeys;
        const remainingText = document.createTextNode(text.substring(typedKeys.length));
        element.innerHTML = '';
        element.appendChild(boldEl);
        element.appendChild(remainingText);
      } else {
        element.textContent = text;
      }
      const shouldShow = (!typedKeys || matchesTyped) && inViewport !== false;
      element.style.display = shouldShow ? '' : 'none';
    });

    return matchingHints;
  };

  const scheduleHintRefresh = () => {
    if (!hintsActive) return;
    if (refreshTimeout) return;
    refreshTimeout = setTimeout(() => {
      refreshTimeout = null;
      updateHintPositions();
      updateHintVisuals();
    }, config.refreshDelay);
  };

  const handleKeyDown = event => {
    const path = event.composedPath ? event.composedPath() : [event.target];
    if (path.some(isEditableElement)) return;

    if (event.metaKey || event.ctrlKey || event.altKey) return;

    const key = (event.key || '').toLowerCase();
    const code = event.code || '';

    // Scroll down/up using 'j' and 'k'
    if (key === 'j' || code === 'KeyJ') {
      window.scrollBy({ top: config.scrollLines * 16, behavior: 'smooth' });
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (key === 'k' || code === 'KeyK') {
      window.scrollBy({ top: -config.scrollLines * 16, behavior: 'smooth' });
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (event.repeat) return;

    if (key === 'escape' && hintsActive) {
      clearHints();
      event.preventDefault();
      return;
    }

    // Activate hints with the configured key
    if (isHintToggleKey(event)) {
      hintsActive ? clearHints() : generateLinkHints();
      event.preventDefault();
      return;
    }

    // Process hint keys if hints are active
    if (hintsActive && linkHints.length > 0) {
      if (key === 'backspace') {
        typedKeys = typedKeys.slice(0, -1);
      } else {
        const hintKey = getHintKey(event);
        if (!hintKey) return;
        typedKeys += hintKey;
      }

      const matchingHints = updateHintVisuals();

      if (matchingHints.length === 1 && matchingHints[0].text === typedKeys) {
        clearTimeout(hintTimeout);
        hintTimeout = setTimeout(() => triggerLink(matchingHints[0].linkElement), 0);
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

  const handleScroll = () => {
    if (hintsActive) scheduleHintRefresh();
  };

  const handleResize = () => {
    if (hintsActive) scheduleHintRefresh();
  };

  const handleMouseDown = () => {
    if (hintsActive) clearHints();
  };

  // Clean up event listeners and hints
  const cleanup = () => {
    document.removeEventListener('keydown', handleKeyDown, true);
    document.removeEventListener('keyup', handleKeyUp, true);
    document.removeEventListener('mousedown', handleMouseDown, true);
    window.removeEventListener('scroll', handleScroll, true);
    window.removeEventListener('resize', handleResize, true);
    clearHints();
  };

  document.addEventListener('keydown', handleKeyDown, true);
  document.addEventListener('keyup', handleKeyUp, true);
  document.addEventListener('mousedown', handleMouseDown, true);
  window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
  window.addEventListener('resize', handleResize, { capture: true, passive: true });
  window.removeHotkeyListeners = cleanup;
})();
