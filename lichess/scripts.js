// ==UserScript==
// @name        Lichess Puzzle Session Statistics
// @namespace   https://github.com/anonimizerme/userscripts
// @version     1.0
// @description Show live solved, successful, and failed counts during Lichess puzzle sessions
// @match       https://lichess.org/training*
// @grant       none
// @run-at      document-idle
// ==/UserScript==

((root, createPuzzleSessionStats) => {
  'use strict';

  if (typeof document === 'undefined' && typeof module === 'object' && module.exports) {
    module.exports = createPuzzleSessionStats;
    return;
  }

  createPuzzleSessionStats({
    document: root.document,
    MutationObserver: root.MutationObserver,
    requestAnimationFrame: root.requestAnimationFrame.bind(root),
    cancelAnimationFrame: root.cancelAnimationFrame.bind(root),
  }).start();
})(globalThis, dependencies => {
  'use strict';

  const { document, MutationObserver, requestAnimationFrame, cancelAnimationFrame } = dependencies;

  const config = {
    sessionSelector: '.puzzle__session',
    successfulSelector: '.result-true',
    failedSelector: '.result-false',
    statsId: 'lichess-puzzle-session-stats',
    styleId: 'lichess-puzzle-session-stats-style',
  };

  let activeSession = null;
  let sessionObserver = null;
  let pageObserver = null;
  let updateFrame = null;

  const calculateStats = session => {
    const successful = session.querySelectorAll(config.successfulSelector).length;
    const failed = session.querySelectorAll(config.failedSelector).length;
    const solved = successful + failed;
    const percentage = solved === 0 ? 0 : Math.round((successful / solved) * 100);

    return { solved, successful, failed, percentage };
  };

  const addStyles = () => {
    if (document.getElementById(config.styleId)) return;

    const style = document.createElement('style');
    style.id = config.styleId;
    style.textContent = `
      #${config.statsId} {
        box-sizing: border-box;
        flex: 1 0 100%;
        grid-column: 1 / -1;
        width: 100%;
        margin-top: .5rem;
        padding: .45rem .65rem;
        border-radius: .4rem;
        background: rgba(128, 128, 128, .12);
        color: var(--c-font, inherit);
        font-size: .85rem;
        line-height: 1.35;
        text-align: center;
      }

      #${config.statsId} .lichess-puzzle-stats__successful {
        color: var(--c-good, #629924);
      }

      #${config.statsId} .lichess-puzzle-stats__failed {
        color: var(--c-bad, #d85040);
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  };

  const createValue = (name, className = '') => {
    const value = document.createElement('strong');
    value.dataset.stat = name;
    value.className = className;
    return value;
  };

  const createStatsElement = () => {
    const stats = document.createElement('div');
    stats.id = config.statsId;
    stats.setAttribute('role', 'status');
    stats.setAttribute('aria-live', 'polite');
    stats.setAttribute('aria-atomic', 'true');

    stats.append(
      'Решено: ',
      createValue('solved'),
      ' · Успешно: ',
      createValue('successful', 'lichess-puzzle-stats__successful'),
      ' · Ошибок: ',
      createValue('failed', 'lichess-puzzle-stats__failed'),
      ' · ',
      createValue('percentage'),
      '%'
    );

    return stats;
  };

  const ensureStatsElement = session => {
    let stats = document.getElementById(config.statsId);

    if (!stats || stats.parentElement !== session) {
      stats = createStatsElement();
      session.appendChild(stats);
    }

    return stats;
  };

  const render = () => {
    updateFrame = null;

    if (!activeSession?.isConnected) {
      connectToCurrentSession();
      return;
    }

    const values = calculateStats(activeSession);
    const signature = `${values.solved}:${values.successful}:${values.failed}`;
    const stats = ensureStatsElement(activeSession);

    if (stats.dataset.signature === signature) return;

    Object.entries(values).forEach(([name, value]) => {
      const target = stats.querySelector(`[data-stat="${name}"]`);
      if (target) target.textContent = String(value);
    });
    stats.dataset.signature = signature;
  };

  const scheduleRender = () => {
    if (updateFrame !== null) return;
    updateFrame = requestAnimationFrame(render);
  };

  const attachSession = session => {
    sessionObserver?.disconnect();
    activeSession = session;

    if (!activeSession) return;

    sessionObserver = new MutationObserver(scheduleRender);
    sessionObserver.observe(activeSession, {
      attributes: true,
      attributeFilter: ['class'],
      childList: true,
      subtree: true,
    });
    scheduleRender();
  };

  function connectToCurrentSession() {
    const currentSession = document.querySelector(config.sessionSelector);
    if (currentSession !== activeSession) attachSession(currentSession);
  }

  const handlePageMutation = () => {
    if (activeSession?.isConnected) return;
    connectToCurrentSession();
  };

  const start = () => {
    addStyles();
    connectToCurrentSession();

    pageObserver = new MutationObserver(handlePageMutation);
    pageObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  };

  const stop = () => {
    pageObserver?.disconnect();
    sessionObserver?.disconnect();

    if (updateFrame !== null) {
      cancelAnimationFrame(updateFrame);
      updateFrame = null;
    }
  };

  return { start, stop, calculateStats };
});
