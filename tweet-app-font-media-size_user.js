// ==UserScript==
// @name         Tweet.app Font/Width Adjust + Link Card + Composer Toggle
// @namespace    https://imgd.net/
// @version      1.9
// @description  Adjust font size and content width on app.tweet.app (with a tap-select panel), show OGP link cards for URLs in tweet text (with persistent cache), toggle the always-visible composer, and toggle video/GIF autoplay.
// @match        https://app.tweet.app/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      *
// @icon         https://app.tweet.app/assets/brand/bird-blue.svg
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  // ============================================================
  // CONFIG
  // ============================================================

  const CONFIG = {
    font: {
      key: 'tweetapp_font_size_px',
      default: 15,
      presets: [15, 18, 22],
    },
    media: {
      key: 'tweetapp_media_width_pct',
      default: 100,
      presets: [
        { pct: 100, label: 'Default' },
        { pct: 75, label: 'Medium' },
        { pct: 50, label: 'Small' },
      ],
    },
    linkCard: {
      enabledKey: 'tweetapp_linkcard_enabled',
      enabledDefault: true,
      className: 'ogp-link-card',
      cacheKey: 'tweetapp_ogp_cache_v1',
      cacheMaxEntries: 300,
      cacheTtlMs: 7 * 24 * 60 * 60 * 1000,
    },
    composer: {
      visibleKey: 'tweetapp_composer_visible',
      visibleDefault: true,
      containerSelector: 'main div:has(textarea#public-tweet-input):not(:has(article)):not([role="dialog"] *), main div:has(textarea[name="compose-text"]):not(:has(article)):not([role="dialog"] *)',
      textareaSelector: 'textarea#public-tweet-input, textarea#public-modal-tweet-input, textarea[name="compose-text"], textarea',
    },
    autoplay: {
      enabledKey: 'tweetapp_autoplay_enabled',
      enabledDefault: true,
      manualPlayGraceMs: 1500,
    },
  };

  // ============================================================
  // Settings
  // ============================================================

  function createSetting(key, defaultValue, onChange) {
    return {
      get: () => GM_getValue(key, defaultValue),
      set: (value) => {
        GM_setValue(key, value);
        if (onChange) onChange(value);
      },
    };
  }

  let styleEl = null;

  const fontSizeSetting = createSetting(CONFIG.font.key, CONFIG.font.default, () => applyStyles());
  const mediaPctSetting = createSetting(CONFIG.media.key, CONFIG.media.default, () => applyStyles());
  const composerVisibleSetting = createSetting(CONFIG.composer.visibleKey, CONFIG.composer.visibleDefault, () => applyStyles());
  const linkCardEnabledSetting = createSetting(CONFIG.linkCard.enabledKey, CONFIG.linkCard.enabledDefault, (enabled) => {
    if (enabled) document.querySelectorAll('article').forEach(processArticle);
    else removeAllLinkCards();
  });
  const autoplayEnabledSetting = createSetting(CONFIG.autoplay.enabledKey, CONFIG.autoplay.enabledDefault, () => applyAutoplaySetting());

  // ============================================================
  // 動画・GIF自動再生制御
  // ============================================================

  const manualPlayUntil = new WeakMap();

  function isTrackedVideo(node) {
    return node instanceof HTMLVideoElement && !!node.closest('article');
  }

  function getVideoFromEventTarget(target) {
    if (!(target instanceof Element)) return null;
    const video = target.closest('article video');
    return video instanceof HTMLVideoElement ? video : null;
  }

  function markManualVideoGesture(event) {
    const video = getVideoFromEventTarget(event.target);
    if (!video) return;
    manualPlayUntil.set(video, Date.now() + CONFIG.autoplay.manualPlayGraceMs);
  }

  function isManualVideoPlay(video) {
    const until = manualPlayUntil.get(video) || 0;
    if (until > Date.now()) return true;
    manualPlayUntil.delete(video);
    return false;
  }

  function stopVideo(video) {
    if (!(video instanceof HTMLVideoElement)) return;
    video.autoplay = false;
    video.removeAttribute('autoplay');
    video.pause();
  }

  function startVideo(video) {
    if (!(video instanceof HTMLVideoElement)) return;
    video.autoplay = true;
    if (!video.hasAttribute('autoplay')) video.setAttribute('autoplay', '');
    video.muted = true;
    if (video.paused) video.play().catch(() => {});
  }

  function applyAutoplayToVideo(video) {
    if (!isTrackedVideo(video)) return;
    if (autoplayEnabledSetting.get()) startVideo(video);
    else stopVideo(video);
  }

  function applyAutoplaySetting(root = document) {
    const enabled = autoplayEnabledSetting.get();
    const videos = [];

    if (root instanceof HTMLVideoElement) {
      videos.push(root);
    } else {
      root.querySelectorAll?.('article video').forEach((video) => videos.push(video));
    }

    videos.forEach((video) => {
      if (!(video instanceof HTMLVideoElement)) return;
      if (enabled) startVideo(video);
      else stopVideo(video);
    });
  }

  document.addEventListener('pointerdown', markManualVideoGesture, true);
  document.addEventListener('touchstart', markManualVideoGesture, true);
  document.addEventListener('mousedown', markManualVideoGesture, true);
  document.addEventListener('keydown', markManualVideoGesture, true);

  document.addEventListener('play', (event) => {
    const video = event.target;
    if (!isTrackedVideo(video)) return;
    if (autoplayEnabledSetting.get()) return;
    if (isManualVideoPlay(video)) return;

    video.pause();
    video.autoplay = false;
    video.removeAttribute('autoplay');
  }, true);

  document.addEventListener('playing', (event) => {
    const video = event.target;
    if (!isTrackedVideo(video)) return;
    if (autoplayEnabledSetting.get()) return;
    if (isManualVideoPlay(video)) return;

    video.pause();
  }, true);

  // ============================================================
  // 選択パネルCSS
  // ============================================================

  const CHOICE_PANEL_CSS = `
    #tweetapp-choice-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.4);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    #tweetapp-choice-panel {
      background: #fff;
      border-radius: 14px;
      min-width: 240px;
      max-width: 90vw;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    }
    #tweetapp-choice-panel .tweetapp-choice-title {
      padding: 14px 16px 8px;
      font-size: 13px;
      color: #536471;
      border-bottom: 1px solid #eee;
    }
    #tweetapp-choice-panel .tweetapp-choice-item {
      display: block;
      width: 100%;
      text-align: left;
      padding: 14px 16px;
      font-size: 16px;
      color: #0f1419;
      background: #fff;
      border: none;
      border-bottom: 1px solid #eee;
    }
    #tweetapp-choice-panel .tweetapp-choice-item:last-of-type {
      border-bottom: none;
    }
    #tweetapp-choice-panel .tweetapp-choice-item:active {
      background: #f0f3f4;
    }
    #tweetapp-choice-panel .tweetapp-choice-item.tweetapp-choice-current {
      color: #1d9bf0;
      font-weight: 600;
    }
    #tweetapp-choice-panel .tweetapp-choice-cancel {
      display: block;
      width: 100%;
      text-align: center;
      padding: 14px 16px;
      font-size: 15px;
      color: #536471;
      background: #f7f8f8;
      border: none;
    }
  `;

  // ============================================================
  // スタイル適用
  // ============================================================

  function applyStyles() {
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'tweetapp-appearance-style';
      if (document.documentElement) document.documentElement.appendChild(styleEl);
    }

    const fontSize = fontSizeSetting.get();
    const mediaPct = mediaPctSetting.get();
    const composerVisible = composerVisibleSetting.get();

    styleEl.textContent = `
      /* ツイート本文のフォントサイズ */
      article p {
        font-size: ${fontSize}px !important;
        line-height: 1.5 !important;
      }

      /* 入力テキストエリアおよび裏側のミラー表示要素（文字＆カーソル位置ずれ防止） */
      textarea#public-tweet-input,
      textarea#public-modal-tweet-input,
      textarea[name="compose-text"],
      textarea,
      div:has(> textarea) [aria-hidden="true"],
      div:has(> textarea) div {
        font-size: ${fontSize}px !important;
        line-height: 1.5 !important;
      }

      /* 画像・動画・リンクカードの表示幅 */
      article div.rounded-2xl.overflow-hidden,
      article div.${CONFIG.linkCard.className} {
        width: ${mediaPct}% !important;
        margin-left: auto !important;
        margin-right: auto !important;
      }

      /* 常時表示の投稿欄（フィード最上部のみ） */
      ${composerVisible ? '' : `
      ${CONFIG.composer.containerSelector} {
        display: none !important;
      }`}

      ${CHOICE_PANEL_CSS}
    `;

    applyFontSizeToBodies();
    applyFontSizeToComposers();
  }

  function applyFontSizeToBodies(root = document) {
    const fontSize = fontSizeSetting.get();
    root.querySelectorAll?.('article p').forEach((p) => {
      p.style.setProperty('font-size', `${fontSize}px`, 'important');
      p.style.setProperty('line-height', '1.5', 'important');
    });
  }

  function applyFontSizeToComposers(root = document) {
    const fontSize = fontSizeSetting.get();
    root.querySelectorAll?.(CONFIG.composer.textareaSelector).forEach((textarea) => {
      textarea.style.setProperty('font-size', `${fontSize}px`, 'important');
      textarea.style.setProperty('line-height', '1.5', 'important');

      if (textarea.parentElement) {
        textarea.parentElement.querySelectorAll('*').forEach((el) => {
          el.style.setProperty('font-size', `${fontSize}px`, 'important');
          el.style.setProperty('line-height', '1.5', 'important');
        });
      }
    });
  }

  // ============================================================
  // 選択パネル & メニュー
  // ============================================================

  function showChoicePanel(title, items, currentIndex, onSelect) {
    const overlay = document.createElement('div');
    overlay.id = 'tweetapp-choice-overlay';

    const panel = document.createElement('div');
    panel.id = 'tweetapp-choice-panel';

    const titleEl = document.createElement('div');
    titleEl.className = 'tweetapp-choice-title';
    titleEl.textContent = title;
    panel.appendChild(titleEl);

    items.forEach((label, i) => {
      const isCurrent = i === currentIndex;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tweetapp-choice-item' + (isCurrent ? ' tweetapp-choice-current' : '');
      btn.textContent = label + (isCurrent ? ' (current)' : '');
      btn.addEventListener('click', () => {
        overlay.remove();
        onSelect(i);
      });
      panel.appendChild(btn);
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'tweetapp-choice-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => overlay.remove());
    panel.appendChild(cancelBtn);

    overlay.appendChild(panel);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  }

  function chooseFontSize() {
    const presets = CONFIG.font.presets;
    const items = presets.map((px) => `${px}px`);
    const curIdx = presets.indexOf(fontSizeSetting.get());
    showChoicePanel('Select font size', items, curIdx, (i) => fontSizeSetting.set(presets[i]));
  }

  function chooseMediaWidth() {
    const presets = CONFIG.media.presets;
    const items = presets.map((m) => `${m.label}(${m.pct}%)`);
    const curIdx = presets.findIndex((m) => m.pct === mediaPctSetting.get());
    showChoicePanel('Select content width', items, curIdx, (i) => mediaPctSetting.set(presets[i].pct));
  }

  function chooseBoolean(title, labels, setting) {
    const curIdx = setting.get() ? 0 : 1;
    showChoicePanel(title, labels, curIdx, (i) => setting.set(i === 0));
  }

  function chooseComposerVisible() {
    chooseBoolean('Select composer visibility', ['Show', 'Hide'], composerVisibleSetting);
  }

  function chooseLinkCardEnabled() {
    chooseBoolean('Select link card display', ['ON', 'OFF'], linkCardEnabledSetting);
  }

  function chooseAutoplay() {
    chooseBoolean('Select video/GIF autoplay', ['ON', 'OFF'], autoplayEnabledSetting);
  }

  function clearOgpCache() {
    GM_setValue(CONFIG.linkCard.cacheKey, {});
    ogpCache.clear();
    alert('Link card cache cleared');
  }

  const MENU_COMMANDS = [
    ['Change font size', chooseFontSize],
    ['Change content width', chooseMediaWidth],
    ['Composer visibility ON/OFF', chooseComposerVisible],
    ['Video/GIF autoplay ON/OFF', chooseAutoplay],
    ['Link card ON/OFF', chooseLinkCardEnabled],
    ['Clear link card cache', clearOgpCache],
  ];

  function registerMenuCommands() {
    MENU_COMMANDS.forEach(([label, handler]) => GM_registerMenuCommand(label, handler));
  }

  // ============================================================
  // OGPキャッシュ & リンクカード
  // ============================================================

  const ogpCache = new Map();

  function loadOgpCacheFromStorage() {
    const stored = GM_getValue(CONFIG.linkCard.cacheKey, {});
    const now = Date.now();
    for (const [url, entry] of Object.entries(stored)) {
      if (entry?.ts && now - entry.ts < CONFIG.linkCard.cacheTtlMs) {
        ogpCache.set(url, entry.data);
      }
    }
  }

  function persistOgpCache() {
    const now = Date.now();
    const entries = Array.from(ogpCache.entries()).slice(-CONFIG.linkCard.cacheMaxEntries);
    const obj = {};
    for (const [url, data] of entries) {
      obj[url] = { data, ts: now };
    }
    GM_setValue(CONFIG.linkCard.cacheKey, obj);
  }

  function fetchOgp(url, cb) {
    if (ogpCache.has(url)) return cb(ogpCache.get(url));

    GM_xmlhttpRequest({
      method: 'GET',
      url,
      onload: (res) => {
        try {
          const data = parseOgpFromHtml(res.responseText);
          ogpCache.set(url, data);
          persistOgpCache();
          cb(data);
        } catch (e) {
          cb(null);
        }
      },
      onerror: () => cb(null),
    });
  }

  function parseOgpFromHtml(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const getMeta = (prop) =>
      doc.querySelector(`meta[property="${prop}"]`)?.content
      || doc.querySelector(`meta[name="${prop}"]`)?.content
      || '';

    const title = getMeta('og:title') || doc.querySelector('title')?.textContent || '';
    const description = getMeta('og:description') || getMeta('description');
    const image = getMeta('og:image');

    if (!title && !image) return null;
    return { title, description, image: image ? { url: image } : null };
  }

  function extractUrl(article) {
    return article.querySelector('p a[href^="http"]')?.href ?? null;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function buildLinkCard(data, url) {
    const wrapper = document.createElement('div');
    wrapper.dataset.ogpCard = url;
    wrapper.className = `rounded-2xl overflow-hidden ${CONFIG.linkCard.className}`;
    wrapper.style.cssText = 'margin-top:8px;margin-left:auto;margin-right:auto;';

    const card = document.createElement('a');
    card.href = url;
    card.target = '_blank';
    card.rel = 'noopener noreferrer';
    card.style.cssText = 'display:block;border:1px solid #d9d9d9;border-radius:12px;overflow:hidden;text-decoration:none;color:inherit;';

    const hostname = escapeHtml(new URL(url).hostname);
    const title = escapeHtml(data.title || '');
    const description = escapeHtml((data.description || '').slice(0, 100));
    const image = data.image?.url
      ? `<img src="${escapeHtml(data.image.url)}" style="width:100%;max-height:200px;object-fit:cover;display:block;">`
      : '';

    card.innerHTML = `
      ${image}
      <div style="padding:8px 12px;">
        <div style="font-size:13px;color:#536471;">${hostname}</div>
        <div style="font-weight:600;font-size:14px;margin-top:2px;">${title}</div>
        <div style="font-size:13px;color:#536471;margin-top:2px;">${description}</div>
      </div>`;

    wrapper.appendChild(card);
    return wrapper;
  }

  function removeAllLinkCards() {
    document.querySelectorAll('[data-ogp-card]').forEach((el) => el.remove());
    document.querySelectorAll('article[data-ogp-fetching]').forEach((el) => delete el.dataset.ogpFetching);
  }

  function processArticle(article) {
    if (!linkCardEnabledSetting.get()) return;

    const url = extractUrl(article);
    const existingCard = article.querySelector('[data-ogp-card]');

    if (!url) {
      if (existingCard) existingCard.remove();
      delete article.dataset.ogpFetching;
      return;
    }

    if (existingCard) {
      if (existingCard.dataset.ogpCard === url) return;
      existingCard.remove();
      delete article.dataset.ogpFetching;
    }

    if (article.dataset.ogpFetching === url) return;
    article.dataset.ogpFetching = url;

    fetchOgp(url, (data) => {
      if (article.dataset.ogpFetching !== url) return;
      delete article.dataset.ogpFetching;

      if (!linkCardEnabledSetting.get()) return;
      if (!data) return;
      if (article.querySelector('[data-ogp-card]')) return;

      article.querySelector('p')?.insertAdjacentElement('afterend', buildLinkCard(data, url));
    });
  }

  // ============================================================
  // DOM監視（最適化）
  // ============================================================

  function handleAddedNode(node) {
    if (node.nodeType !== 1) return;

    if (node.matches?.('article')) processArticle(node);
    node.querySelectorAll?.('article').forEach(processArticle);

    applyFontSizeToBodies(node);
    applyFontSizeToComposers(node);
    applyAutoplaySetting(node);
  }

  function startObserving() {
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach(handleAddedNode);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  // ============================================================
  // 初期化
  // ============================================================

  function init() {
    loadOgpCacheFromStorage();
    applyStyles();
    applyAutoplaySetting();
    registerMenuCommands();
    startObserving();
    document.querySelectorAll('article').forEach(processArticle);

    requestAnimationFrame(() => {
      applyStyles();
      applyAutoplaySetting();
    });
    setTimeout(() => {
      applyStyles();
      applyAutoplaySetting();
    }, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
