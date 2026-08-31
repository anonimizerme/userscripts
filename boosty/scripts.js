// ==UserScript==
// @name        Boosty Video Download Links
// @namespace   https://github.com/anonimizerme/userscripts
// @version     0.3
// @description Adds direct download links for every available Boosty video quality
// @match       https://boosty.to/*
// @grant       none
// ==/UserScript==

(() => {
  'use strict';

  const contentSelector = 'div[data-test-id="COMMON_POST_POSTCONTENT:ROOT"]';
  const qualityLabels = new Map([
    ['ultra_hd', '2160p'],
    ['quad_hd', '1440p'],
    ['full_hd', '1080p'],
    ['high', '720p'],
    ['medium', '480p'],
    ['low', '360p'],
    ['lowest', '240p'],
    ['tiny', '144p'],
  ]);
  const requests = new Map();
  let scanTimeout;

  const getPostMetadata = value => {
    const { pathname } = new URL(value, 'https://boosty.to');
    const match = pathname.match(/^\/([^/]+)\/posts\/([^/]+)/);
    return match ? { blogName: decodeURIComponent(match[1]), id: match[2] } : null;
  };

  const getMetadataForContent = content => {
    const post = content.closest('div[class*="Post-scss--module_root_"]');
    const postLink = post?.querySelector('a[href*="/posts/"]');
    return getPostMetadata(postLink?.href || location.href);
  };

  const getVideoLinks = post => (Array.isArray(post?.data) ? post.data : [])
    .filter(component => component.type === 'ok_video')
    .map(component => ({
      title: component.title || '',
      links: (Array.isArray(component.playerUrls) ? component.playerUrls : [])
        .filter(({ type, url }) => qualityLabels.has(type) && url)
        .sort((a, b) => [...qualityLabels.keys()].indexOf(a.type) - [...qualityLabels.keys()].indexOf(b.type)),
    }))
    .filter(video => video.links.length);

  const getAccessToken = () => {
    try {
      return JSON.parse(localStorage.getItem('auth'))?.accessToken || '';
    } catch {
      return '';
    }
  };

  const loadPost = metadata => {
    const key = `${metadata.blogName}/${metadata.id}`;
    if (!requests.has(key)) {
      const token = getAccessToken();
      requests.set(key, fetch(
        `https://api.boosty.to/v1/blog/${encodeURIComponent(metadata.blogName)}/post/${encodeURIComponent(metadata.id)}?component_limit=0`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      ).then(response => {
        if (!response.ok) throw new Error(`Boosty API: ${response.status}`);
        return response.json();
      }).catch(error => {
        requests.delete(key);
        throw error;
      }));
    }
    return requests.get(key);
  };

  const createBlock = key => {
    const block = document.createElement('section');
    block.className = 'boosty-download-links';
    block.dataset.postKey = key;
    block.textContent = 'Загрузка ссылок на видео…';
    return block;
  };

  const renderLinks = (block, videos) => {
    block.replaceChildren();

    videos.forEach((video, index) => {
      const row = document.createElement('div');
      row.className = 'boosty-download-links__row';

      const label = document.createElement('span');
      label.textContent = videos.length > 1 ? `⬇️ ${index + 1}:` : '⬇️';
      row.append(label);

      video.links.forEach(({ type, url }, linkIndex) => {
        if (linkIndex) {
          const separator = document.createElement('span');
          separator.className = 'boosty-download-links__separator';
          separator.textContent = '·';
          separator.setAttribute('aria-hidden', 'true');
          row.append(separator);
        }

        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = qualityLabels.get(type);
        link.title = video.title || `Скачать видео в качестве ${qualityLabels.get(type)}`;
        row.append(link);
      });

      block.append(row);
    });
  };

  const enhanceContent = async content => {
    const metadata = getMetadataForContent(content);
    if (!metadata) return;

    const videoBlocks = content.querySelectorAll('div[class*="VideoBlock-scss--module_root_"]');
    const lastVideoBlock = videoBlocks[videoBlocks.length - 1];
    if (!lastVideoBlock) return;

    const key = `${metadata.blogName}/${metadata.id}`;
    const existing = content.querySelector('.boosty-download-links');
    if (existing?.dataset.postKey === key) return;
    existing?.remove();

    const block = createBlock(key);
    lastVideoBlock.after(block);

    try {
      const videos = getVideoLinks(await loadPost(metadata));
      if (!block.isConnected) return;
      if (videos.length) renderLinks(block, videos);
      else block.remove();
    } catch (error) {
      console.error('[Boosty downloads]', error);
      block.textContent = 'Не удалось получить ссылки на видео.';
    }
  };

  const scan = () => {
    document.querySelectorAll(contentSelector).forEach(enhanceContent);
  };

  const scheduleScan = () => {
    clearTimeout(scanTimeout);
    scanTimeout = setTimeout(scan, 100);
  };

  const addStyles = () => {
    const style = document.createElement('style');
    style.textContent = `
      .boosty-download-links {
        display: grid;
        gap: 8px;
        margin: 16px 0 0;
        padding: 12px 16px 4px;
        color: inherit;
        font: inherit;
      }
      .boosty-download-links__row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 7px 10px;
      }
      .boosty-download-links__row span {
        margin-right: 2px;
      }
      .boosty-download-links__row a {
        color: #e95124;
        font-weight: 600;
        text-decoration: none;
      }
      .boosty-download-links__row a:hover {
        text-decoration: underline;
      }
      .boosty-download-links__row .boosty-download-links__separator {
        margin: 0;
        color: rgba(127, 127, 127, .55);
      }
    `;
    document.head.append(style);
  };

  if (typeof module === 'object') {
    module.exports = { getPostMetadata, getVideoLinks };
    return;
  }

  addStyles();
  scan();
  new MutationObserver(scheduleScan).observe(document.documentElement, { childList: true, subtree: true });
})();
