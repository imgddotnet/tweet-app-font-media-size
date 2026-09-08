// ==UserScript==
// @name         Tweet.app フォント・幅調整 + リンクカード + 投稿欄表示切替
// @namespace    https://imgd.net/
// @version      1.1
// @description  app.tweet.app のフォントサイズ・コンテンツ表示幅の調整、本文URLへのOGPリンクカード表示、常時表示の投稿欄の表示/非表示切替
// @match        https://app.tweet.app/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      *
// ==/UserScript==

(function () {
  'use strict';

  // ---------- 設定キー ----------
  const FONT_KEY = 'tweetapp_font_size_px';
  const DEFAULT_FONT_SIZE = 15;

  const MEDIA_KEY = 'tweetapp_media_width_pct';
  const MEDIA_OPTIONS = [100, 75, 50];
  const DEFAULT_MEDIA_PCT = 100;

  const LINKCARD_KEY = 'tweetapp_linkcard_enabled';
  const DEFAULT_LINKCARD_ENABLED = true;
  const LINKCARD_CLASS = 'ogp-link-card';

  const COMPOSER_KEY = 'tweetapp_composer_visible';
  const DEFAULT_COMPOSER_VISIBLE = true;

  function getFontSize() { return GM_getValue(FONT_KEY, DEFAULT_FONT_SIZE); }
  function setFontSize(px) { GM_setValue(FONT_KEY, px); applyStyles(); }

  function getMediaPct() { return GM_getValue(MEDIA_KEY, DEFAULT_MEDIA_PCT); }
  function setMediaPct(pct) { GM_setValue(MEDIA_KEY, pct); applyStyles(); }

  function isLinkCardEnabled() { return GM_getValue(LINKCARD_KEY, DEFAULT_LINKCARD_ENABLED); }
  function setLinkCardEnabled(v) {
    GM_setValue(LINKCARD_KEY, v);
    if (!v) removeAllLinkCards();
    else document.querySelectorAll('article').forEach(processArticle);
  }

  function isComposerVisible() { return GM_getValue(COMPOSER_KEY, DEFAULT_COMPOSER_VISIBLE); }
  function setComposerVisible(v) { GM_setValue(COMPOSER_KEY, v); applyStyles(); }

  // ---------- スタイル適用(フォント・幅・投稿欄表示) ----------
  let styleEl = null;

  function applyStyles() {
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'tweetapp-appearance-style';
      document.documentElement.appendChild(styleEl);
    }
    const fontSize = getFontSize();
    const mediaPct = getMediaPct();
    const composerVisible = isComposerVisible();

    styleEl.textContent = `
      /* ツイート本文表示 */
      article p.text-tl-app-text,
      /* 投稿編集欄(textarea・通常/モーダル) */
      textarea#public-tweet-input,
      textarea#public-modal-tweet-input {
        font-size: ${fontSize}px !important;
        line-height: 1.5 !important;
      }

      /* 画像・動画の表示幅、およびリンクカード幅 */
      article div.rounded-2xl.overflow-hidden,
      article div.${LINKCARD_CLASS} {
        width: ${mediaPct}% !important;
        margin-left: auto !important;
        margin-right: auto !important;
      }

      /* 常時表示の投稿欄(アバター・アイコン・Tweetボタンを含む外枠全体、モーダル欄は対象外) */
      ${composerVisible ? '' : `
      div.px-4.pt-5.pb-4:has(#public-tweet-input) {
        display: none !important;
      }`}
    `;
  }

  // ---------- メニューコマンド ----------
  function promptFontSize() {
    const cur = getFontSize();
    const input = prompt('フォントサイズ(px)を入力', String(cur));
    if (input === null) return;
    const n = parseInt(input, 10);
    if (!Number.isFinite(n) || n <= 0) { alert('無効な数値'); return; }
    setFontSize(n);
  }

  function promptMediaWidth() {
    const cur = getMediaPct();
    const labels = MEDIA_OPTIONS.map((pct) => {
      const label = pct === 100 ? 'デフォルト' : pct === 75 ? 'デフォルトの3/4' : 'デフォルトの1/2';
      return `${pct}: ${label}${pct === cur ? ' (現在)' : ''}`;
    }).join('\n');
    const input = prompt(`画像・動画・リンクカードの幅を選択\n${labels}`, String(cur));
    if (input === null) return;
    const n = parseInt(input, 10);
    if (!MEDIA_OPTIONS.includes(n)) { alert('100 / 75 / 50 のいずれかを入力'); return; }
    setMediaPct(n);
  }

  function toggleLinkCard() {
    const next = !isLinkCardEnabled();
    setLinkCardEnabled(next);
    alert(`リンクカード表示: ${next ? 'ON' : 'OFF'}`);
  }

  function toggleComposer() {
    const next = !isComposerVisible();
    setComposerVisible(next);
    alert(`投稿欄表示: ${next ? 'ON' : 'OFF'}`);
  }

  GM_registerMenuCommand('フォントサイズ変更', promptFontSize);
  GM_registerMenuCommand('画像・動画・リンクカードの幅を変更', promptMediaWidth);
  GM_registerMenuCommand('リンクカード表示 ON/OFF', toggleLinkCard);
  GM_registerMenuCommand('投稿欄表示 ON/OFF', toggleComposer);

  // ---------- リンクカード ----------
  const cache = new Map();

  function extractUrl(article) {
    const a = article.querySelector('p a[href^="http"]');
    return a ? a.href : null;
  }

  function parseOgp(html, url) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const get = (prop) => doc.querySelector(`meta[property="${prop}"]`)?.content
      || doc.querySelector(`meta[name="${prop}"]`)?.content
      || '';
    const title = get('og:title') || doc.querySelector('title')?.textContent || '';
    const description = get('og:description') || get('description');
    const image = get('og:image');
    if (!title && !image) return null;
    return { title, description, image: image ? { url: image } : null };
  }

  function fetchOgp(url, cb) {
    if (cache.has(url)) return cb(cache.get(url));
    GM_xmlhttpRequest({
      method: 'GET',
      url,
      onload: (res) => {
        try {
          const data = parseOgp(res.responseText, url);
          cache.set(url, data);
          cb(data);
        } catch (e) { cb(null); }
      },
      onerror: () => cb(null)
    });
  }

  function buildCard(data, url) {
    const wrapper = document.createElement('div');
    wrapper.dataset.ogpCard = url;
    wrapper.className = `rounded-2xl overflow-hidden ${LINKCARD_CLASS}`;
    wrapper.style.cssText = 'margin-top:8px;margin-left:auto;margin-right:auto;';

    const card = document.createElement('a');
    card.href = url;
    card.target = '_blank';
    card.rel = 'noopener noreferrer';
    card.style.cssText = 'display:block;border:1px solid #d9d9d9;border-radius:12px;overflow:hidden;text-decoration:none;color:inherit;';
    card.innerHTML = `
      ${data.image?.url ? `<img src="${data.image.url}" style="width:100%;max-height:200px;object-fit:cover;display:block;">` : ''}
      <div style="padding:8px 12px;">
        <div style="font-size:13px;color:#536471;">${new URL(url).hostname}</div>
        <div style="font-weight:600;font-size:14px;margin-top:2px;">${data.title || ''}</div>
        <div style="font-size:13px;color:#536471;margin-top:2px;">${(data.description || '').slice(0, 100)}</div>
      </div>`;

    wrapper.appendChild(card);
    return wrapper;
  }

  function removeAllLinkCards() {
    document.querySelectorAll('[data-ogp-card]').forEach((el) => el.remove());
    document.querySelectorAll('article[data-ogp-fetching]').forEach((el) => delete el.dataset.ogpFetching);
  }

  function processArticle(article) {
    if (!isLinkCardEnabled()) return;

    const url = extractUrl(article);
    const existing = article.querySelector('[data-ogp-card]');

    if (!url) {
      if (existing) existing.remove();
      delete article.dataset.ogpFetching;
      return;
    }

    if (existing) {
      if (existing.dataset.ogpCard === url) return;
      existing.remove();
      delete article.dataset.ogpFetching;
    }

    if (article.dataset.ogpFetching === url) return;
    article.dataset.ogpFetching = url;

    fetchOgp(url, (data) => {
      if (article.dataset.ogpFetching !== url) return;
      delete article.dataset.ogpFetching;
      if (!isLinkCardEnabled()) return;
      if (!data) return;
      if (article.querySelector('[data-ogp-card]')) return;

      const p = article.querySelector('p');
      p?.insertAdjacentElement('afterend', buildCard(data, url));
    });
  }

  // ---------- DOM監視 ----------
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      m.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        if (node.matches?.('article')) processArticle(node);
        node.querySelectorAll?.('article').forEach(processArticle);
      });
      if (m.type === 'characterData' || m.type === 'attributes') {
        const article = m.target.closest?.('article');
        if (article) processArticle(article);
      }
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true
  });

  // ---------- 初期化 ----------
  applyStyles();
  document.querySelectorAll('article').forEach(processArticle);
})();
