// ==UserScript==
// @name         Tweet.app Font/Width Adjust + Link Card + Composer Toggle
// @namespace    https://imgd.net/
// @version      1.2
// @description  Adjust font size and content width on app.tweet.app (with a tap-select panel), show OGP link cards for URLs in tweet text (with persistent cache), and toggle the always-visible composer.
// @match        https://app.tweet.app/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      *
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
      cacheTtlMs: 7 * 24 * 60 * 60 * 1000, // 7日
    },
    composer: {
      visibleKey: 'tweetapp_composer_visible',
      visibleDefault: true,
      // textareaを含む外枠(アバター・アイコン・Tweetボタンを含む)。モーダル欄は対象外。
      containerSelector: 'div.px-4.pt-5.pb-4:has(#public-tweet-input)',
    },
  };

  // ============================================================
  // Settings: GM_getValue/setValue の薄いラッパー
  // ============================================================

  /**
   * key/defaultValueに紐づくgetter/setterを生成する。
   * setterはonChangeコールバックを呼ぶ(スタイル再適用などに使う)。
   */
  function createSetting(key, defaultValue, onChange) {
    return {
      get: () => GM_getValue(key, defaultValue),
      set: (value) => {
        GM_setValue(key, value);
        if (onChange) onChange(value);
      },
    };
  }

  const fontSizeSetting = createSetting(CONFIG.font.key, CONFIG.font.default, () => applyStyles());
  const mediaPctSetting = createSetting(CONFIG.media.key, CONFIG.media.default, () => applyStyles());
  const composerVisibleSetting = createSetting(CONFIG.composer.visibleKey, CONFIG.composer.visibleDefault, () => applyStyles());
  const linkCardEnabledSetting = createSetting(CONFIG.linkCard.enabledKey, CONFIG.linkCard.enabledDefault, (enabled) => {
    if (enabled) document.querySelectorAll('article').forEach(processArticle);
    else removeAllLinkCards();
  });

  // ============================================================
  // スタイル適用(フォント・幅・投稿欄表示 + 選択パネルUI)
  // ============================================================

  let styleEl = null;

  function applyStyles() {
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'tweetapp-appearance-style';
      document.documentElement.appendChild(styleEl);
    }

    const fontSize = fontSizeSetting.get();
    const mediaPct = mediaPctSetting.get();
    const composerVisible = composerVisibleSetting.get();

    styleEl.textContent = `
      /* ツイート本文表示 / 投稿編集欄(通常・モーダル) */
      article p.text-tl-app-text,
      textarea#public-tweet-input,
      textarea#public-modal-tweet-input {
        font-size: ${fontSize}px !important;
        line-height: 1.5 !important;
      }

      /* 画像・動画の表示幅、およびリンクカード幅 */
      article div.rounded-2xl.overflow-hidden,
      article div.${CONFIG.linkCard.className} {
        width: ${mediaPct}% !important;
        margin-left: auto !important;
        margin-right: auto !important;
      }

      /* 常時表示の投稿欄 */
      ${composerVisible ? '' : `
      ${CONFIG.composer.containerSelector} {
        display: none !important;
      }`}

      ${CHOICE_PANEL_CSS}
    `;
  }

  // ============================================================
  // 選択パネル(prompt()の代替、タップ式の疑似プルダウン)
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

  /**
   * タップ式の選択パネルを表示する。
   * @param {string} title パネル上部に表示するタイトル
   * @param {string[]} items 選択肢ラベルの配列
   * @param {number} currentIndex 現在選択中のインデックス(ハイライト用、該当なしは-1)
   * @param {(selectedIndex: number) => void} onSelect 選択時のコールバック
   */
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

  // ============================================================
  // Tampermonkeyメニューコマンド
  // ============================================================

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

  function chooseComposerVisible() {
    const items = ['Show', 'Hide'];
    const curIdx = composerVisibleSetting.get() ? 0 : 1;
    showChoicePanel('Select composer visibility', items, curIdx, (i) => composerVisibleSetting.set(i === 0));
  }

  function chooseLinkCardEnabled() {
    const items = ['ON', 'OFF'];
    const curIdx = linkCardEnabledSetting.get() ? 0 : 1;
    showChoicePanel('Select link card display', items, curIdx, (i) => linkCardEnabledSetting.set(i === 0));
  }

  function clearOgpCache() {
    GM_setValue(CONFIG.linkCard.cacheKey, {});
    ogpCache.clear();
    alert('Link card cache cleared');
  }

  function registerMenuCommands() {
    GM_registerMenuCommand('Change font size', chooseFontSize);
    GM_registerMenuCommand('Change content width', chooseMediaWidth);
    GM_registerMenuCommand('Composer visibility ON/OFF', chooseComposerVisible);
    GM_registerMenuCommand('Link card ON/OFF', chooseLinkCardEnabled);
    GM_registerMenuCommand('Clear link card cache', clearOgpCache);
  }

  // ============================================================
  // OGPキャッシュ(メモリ + GM_setValueによる永続化)
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
    const entries = Array.from(ogpCache.entries())
      .slice(-CONFIG.linkCard.cacheMaxEntries); // 古い順に上限を超えた分を捨てる

    const obj = {};
    for (const [url, data] of entries) {
      obj[url] = { data, ts: now };
    }
    GM_setValue(CONFIG.linkCard.cacheKey, obj);
  }

  /**
   * 対象URLのOGP情報を取得する(メモリキャッシュ→永続キャッシュ→ネットワークの順)。
   * @param {string} url
   * @param {(data: {title: string, description: string, image: {url: string}|null} | null) => void} cb
   */
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

  /** 取得したHTMLからog:title/og:description/og:imageを抽出する。両方無ければnull。 */
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

  // ============================================================
  // リンクカードのDOM構築・articleごとの反映処理
  // ============================================================

  /** ツイート本文中の最初の外部リンクURLを取得する。 */
  function extractUrl(article) {
    return article.querySelector('p a[href^="http"]')?.href ?? null;
  }

  function buildLinkCard(data, url) {
    // 幅調整CSSのセレクタが "div.rounded-2xl.overflow-hidden" とタグ名div限定のため、
    // 外側はdivでラップし、その中に実際のリンク(a)を配置する。
    const wrapper = document.createElement('div');
    wrapper.dataset.ogpCard = url;
    wrapper.className = `rounded-2xl overflow-hidden ${CONFIG.linkCard.className}`;
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

  /**
   * 1件のarticleを見て、リンクカードの追加・更新・削除を行う。
   * 仮想リスト(DOM再利用)を想定し、既存カードのURLと現在のURLを都度比較する。
   */
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
      if (existingCard.dataset.ogpCard === url) return; // 既に同一URLのカードあり
      existingCard.remove(); // 別URL(DOM再利用)→貼り替え
      delete article.dataset.ogpFetching;
    }

    if (article.dataset.ogpFetching === url) return; // 取得中の多重発火防止
    article.dataset.ogpFetching = url;

    fetchOgp(url, (data) => {
      // fetch完了時点でarticleの状態が変わっていたら破棄
      if (article.dataset.ogpFetching !== url) return;
      delete article.dataset.ogpFetching;

      if (!linkCardEnabledSetting.get()) return;
      if (!data) return; // OGPタグがJSで後から挿入されるサイト等は取得できず対象外
      if (article.querySelector('[data-ogp-card]')) return;

      article.querySelector('p')?.insertAdjacentElement('afterend', buildLinkCard(data, url));
    });
  }

  // ============================================================
  // DOM監視(仮想リストのDOM再利用・新規記事追加に追随)
  // ============================================================

  function startObserving() {
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
      attributes: true,
    });
  }

  // ============================================================
  // 初期化
  // ============================================================

  function init() {
    loadOgpCacheFromStorage();
    applyStyles();
    registerMenuCommands();
    startObserving();
    document.querySelectorAll('article').forEach(processArticle);
  }

  init();
})();
