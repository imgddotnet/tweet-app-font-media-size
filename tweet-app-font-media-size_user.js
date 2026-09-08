// ==UserScript==
// @name         Tweet.app Font/Width Adjust + Link Card + Composer Toggle
// @namespace    https://imgd.net/
// @version      1.4
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
      cacheTtlMs: 7 * 24 * 60 * 60 * 1000,
    },

    composer: {
      visibleKey: 'tweetapp_composer_visible',
      visibleDefault: true,

      // textareaを含む外枠。
      // モーダル欄は対象外。
      containerSelector:
        'div.px-4.pt-5.pb-4:has(#public-tweet-input)',
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

        if (onChange) {
          onChange(value);
        }
      },
    };
  }

  const fontSizeSetting = createSetting(
    CONFIG.font.key,
    CONFIG.font.default,
    () => applyStyles()
  );

  const mediaPctSetting = createSetting(
    CONFIG.media.key,
    CONFIG.media.default,
    () => applyStyles()
  );

  const composerVisibleSetting = createSetting(
    CONFIG.composer.visibleKey,
    CONFIG.composer.visibleDefault,
    () => applyStyles()
  );

  const linkCardEnabledSetting = createSetting(
    CONFIG.linkCard.enabledKey,
    CONFIG.linkCard.enabledDefault,
    (enabled) => {
      if (enabled) {
        document
          .querySelectorAll('article')
          .forEach(processArticle);
      } else {
        removeAllLinkCards();
      }
    }
  );

  // ============================================================
  // Style
  // ============================================================

  let styleEl = null;

  function applyStyles() {
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'tweetapp-appearance-style';

      document.documentElement.appendChild(
        styleEl
      );
    }

    const mediaPct =
      mediaPctSetting.get();

    const composerVisible =
      composerVisibleSetting.get();

    styleEl.textContent = `
      /* 画像・動画・リンクカードの表示幅 */
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

    /*
     * 投稿本文
     */
    applyFontSizeToBodies();

    /*
     * 上部の投稿欄
     */
    applyFontSizeToComposers();
  }

  // ============================================================
  // Tweet body font size
  // ============================================================

  function applyFontSizeToBodies(root = document) {
    const fontSize =
      fontSizeSetting.get();

    root
      .querySelectorAll?.(
        'article p.text-tl-app-text'
      )
      .forEach((p) => {
        p.style.setProperty(
          'font-size',
          `${fontSize}px`,
          'important'
        );

        /*
         * 投稿本文側は従来どおり1.5。
         * 上部の投稿欄には適用しない。
         */
        p.style.setProperty(
          'line-height',
          '1.5',
          'important'
        );
      });
  }

  // ============================================================
  // Composer font size
  // ============================================================

  /*
   * Tweet.appの上部投稿欄は、実際のtextareaとは別に
   * aria-hidden="true" のミラー表示用要素を持っている。
   *
   * 例：
   *
   * <div aria-hidden="true">
   *     表示文字
   * </div>
   *
   * <textarea id="public-tweet-input">
   * </textarea>
   *
   * textarea自体はcolor: transparentになっているため、
   * 画面に表示される文字はミラー側。
   *
   * したがって、
   *
   *   textarea
   *   ミラー要素
   *
   * の両方に同じfont-sizeを設定する。
   *
   * 重要：
   * line-heightは変更しない。
   *
   * Tweet.app本来の「leading-snug」を維持することで、
   * textareaのcaretとミラー文字の縦位置を合わせる。
   */

  function applyFontSizeToComposers(
    root = document
  ) {
    const fontSize =
      fontSizeSetting.get();

    const textareas =
      root.querySelectorAll?.(
        'textarea#public-tweet-input, textarea#public-modal-tweet-input'
      );

    if (!textareas) {
      return;
    }

    textareas.forEach((textarea) => {
      /*
       * 実際のtextarea。
       *
       * フォントサイズだけを変更する。
       * line-heightはTweet.app本来の値を維持する。
       */
      textarea.style.setProperty(
        'font-size',
        `${fontSize}px`,
        'important'
      );

      /*
       * 前バージョンで付けた
       * line-height: 1.5 がページ内に残っている場合だけ除去。
       *
       * 通常はページを再読み込みすれば不要だが、
       * スクリプト更新時の状態も考慮する。
       */
      if (
        textarea.style.lineHeight === '1.5'
      ) {
        textarea.style.removeProperty(
          'line-height'
        );
      }

      const parent =
        textarea.parentElement;

      if (!parent) {
        return;
      }

      /*
       * textareaと同じ親にある
       * aria-hidden="true" のミラー要素を取得。
       */
      for (
        const child of parent.children
      ) {
        if (
          child === textarea
        ) {
          continue;
        }

        if (
          child.getAttribute(
            'aria-hidden'
          ) !== 'true'
        ) {
          continue;
        }

        /*
         * ミラー側もtextareaと同じ
         * font-sizeにする。
         */
        child.style.setProperty(
          'font-size',
          `${fontSize}px`,
          'important'
        );

        /*
         * line-heightは変更しない。
         *
         * 前バージョンの1.5が残っている場合のみ除去。
         */
        if (
          child.style.lineHeight === '1.5'
        ) {
          child.style.removeProperty(
            'line-height'
          );
        }
      }
    });
  }

  // ============================================================
  // Choice panel
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

  function showChoicePanel(
    title,
    items,
    currentIndex,
    onSelect
  ) {
    const overlay =
      document.createElement('div');

    overlay.id =
      'tweetapp-choice-overlay';

    const panel =
      document.createElement('div');

    panel.id =
      'tweetapp-choice-panel';

    const titleEl =
      document.createElement('div');

    titleEl.className =
      'tweetapp-choice-title';

    titleEl.textContent =
      title;

    panel.appendChild(
      titleEl
    );

    items.forEach(
      (label, i) => {
        const isCurrent =
          i === currentIndex;

        const btn =
          document.createElement(
            'button'
          );

        btn.type = 'button';

        btn.className =
          'tweetapp-choice-item' +
          (
            isCurrent
              ? ' tweetapp-choice-current'
              : ''
          );

        btn.textContent =
          label +
          (
            isCurrent
              ? ' (current)'
              : ''
          );

        btn.addEventListener(
          'click',
          () => {
            overlay.remove();

            onSelect(i);
          }
        );

        panel.appendChild(
          btn
        );
      }
    );

    const cancelBtn =
      document.createElement(
        'button'
      );

    cancelBtn.type = 'button';

    cancelBtn.className =
      'tweetapp-choice-cancel';

    cancelBtn.textContent =
      'Cancel';

    cancelBtn.addEventListener(
      'click',
      () => overlay.remove()
    );

    panel.appendChild(
      cancelBtn
    );

    overlay.appendChild(
      panel
    );

    overlay.addEventListener(
      'click',
      (e) => {
        if (
          e.target === overlay
        ) {
          overlay.remove();
        }
      }
    );

    document.body.appendChild(
      overlay
    );
  }

  function chooseFontSize() {
    const presets =
      CONFIG.font.presets;

    const items =
      presets.map(
        (px) => `${px}px`
      );

    const curIdx =
      presets.indexOf(
        fontSizeSetting.get()
      );

    showChoicePanel(
      'Select font size',
      items,
      curIdx,
      (i) => {
        fontSizeSetting.set(
          presets[i]
        );
      }
    );
  }

  function chooseMediaWidth() {
    const presets =
      CONFIG.media.presets;

    const items =
      presets.map(
        (m) =>
          `${m.label}(${m.pct}%)`
      );

    const curIdx =
      presets.findIndex(
        (m) =>
          m.pct ===
          mediaPctSetting.get()
      );

    showChoicePanel(
      'Select content width',
      items,
      curIdx,
      (i) => {
        mediaPctSetting.set(
          presets[i].pct
        );
      }
    );
  }

  function chooseComposerVisible() {
    const items = [
      'Show',
      'Hide',
    ];

    const curIdx =
      composerVisibleSetting.get()
        ? 0
        : 1;

    showChoicePanel(
      'Select composer visibility',
      items,
      curIdx,
      (i) => {
        composerVisibleSetting.set(
          i === 0
        );
      }
    );
  }

  function chooseLinkCardEnabled() {
    const items = [
      'ON',
      'OFF',
    ];

    const curIdx =
      linkCardEnabledSetting.get()
        ? 0
        : 1;

    showChoicePanel(
      'Select link card display',
      items,
      curIdx,
      (i) => {
        linkCardEnabledSetting.set(
          i === 0
        );
      }
    );
  }

  function clearOgpCache() {
    GM_setValue(
      CONFIG.linkCard.cacheKey,
      {}
    );

    ogpCache.clear();

    alert(
      'Link card cache cleared'
    );
  }

  function registerMenuCommands() {
    GM_registerMenuCommand(
      'Change font size',
      chooseFontSize
    );

    GM_registerMenuCommand(
      'Change content width',
      chooseMediaWidth
    );

    GM_registerMenuCommand(
      'Composer visibility ON/OFF',
      chooseComposerVisible
    );

    GM_registerMenuCommand(
      'Link card ON/OFF',
      chooseLinkCardEnabled
    );

    GM_registerMenuCommand(
      'Clear link card cache',
      clearOgpCache
    );
  }

  // ============================================================
  // OGP cache
  // ============================================================

  const ogpCache =
    new Map();

  function loadOgpCacheFromStorage() {
    const stored =
      GM_getValue(
        CONFIG.linkCard.cacheKey,
        {}
      );

    const now =
      Date.now();

    for (
      const [url, entry]
      of Object.entries(stored)
    ) {
      if (
        entry?.ts &&
        now - entry.ts <
          CONFIG.linkCard.cacheTtlMs
      ) {
        ogpCache.set(
          url,
          entry.data
        );
      }
    }
  }

  function persistOgpCache() {
    const now =
      Date.now();

    const entries =
      Array.from(
        ogpCache.entries()
      ).slice(
        -CONFIG.linkCard.cacheMaxEntries
      );

    const obj = {};

    for (
      const [url, data]
      of entries
    ) {
      obj[url] = {
        data,
        ts: now,
      };
    }

    GM_setValue(
      CONFIG.linkCard.cacheKey,
      obj
    );
  }

  function fetchOgp(
    url,
    cb
  ) {
    if (
      ogpCache.has(url)
    ) {
      cb(
        ogpCache.get(url)
      );

      return;
    }

    GM_xmlhttpRequest({
      method: 'GET',
      url,

      onload: (res) => {
        try {
          const data =
            parseOgpFromHtml(
              res.responseText
            );

          ogpCache.set(
            url,
            data
          );

          persistOgpCache();

          cb(data);
        } catch (e) {
          cb(null);
        }
      },

      onerror: () => {
        cb(null);
      },
    });
  }

  function parseOgpFromHtml(
    html
  ) {
    const doc =
      new DOMParser()
        .parseFromString(
          html,
          'text/html'
        );

    const getMeta =
      (prop) =>
        doc.querySelector(
          `meta[property="${prop}"]`
        )?.content
        ||
        doc.querySelector(
          `meta[name="${prop}"]`
        )?.content
        ||
        '';

    const title =
      getMeta('og:title') ||
      doc.querySelector(
        'title'
      )?.textContent ||
      '';

    const description =
      getMeta(
        'og:description'
      ) ||
      getMeta(
        'description'
      );

    const image =
      getMeta('og:image');

    if (
      !title &&
      !image
    ) {
      return null;
    }

    return {
      title,
      description,
      image: image
        ? { url: image }
        : null,
    };
  }

  // ============================================================
  // Link card
  // ============================================================

  function extractUrl(
    article
  ) {
    return (
      article.querySelector(
        'p a[href^="http"]'
      )?.href ??
      null
    );
  }

  function buildLinkCard(
    data,
    url
  ) {
    const wrapper =
      document.createElement(
        'div'
      );

    wrapper.dataset.ogpCard =
      url;

    wrapper.className =
      `rounded-2xl overflow-hidden ${CONFIG.linkCard.className}`;

    wrapper.style.cssText =
      'margin-top:8px;margin-left:auto;margin-right:auto;';

    const card =
      document.createElement(
        'a'
      );

    card.href = url;
    card.target = '_blank';
    card.rel =
      'noopener noreferrer';

    card.style.cssText =
      'display:block;border:1px solid #d9d9d9;border-radius:12px;overflow:hidden;text-decoration:none;color:inherit;';

    const hostname =
      escapeHtml(
        new URL(url)
          .hostname
      );

    const title =
      escapeHtml(
        data.title || ''
      );

    const description =
      escapeHtml(
        (
          data.description ||
          ''
        ).slice(0, 100)
      );

    const image =
      data.image?.url
        ? `
          <img
            src="${escapeHtml(data.image.url)}"
            style="width:100%;max-height:200px;object-fit:cover;display:block;"
          >
        `
        : '';

    card.innerHTML = `
      ${image}

      <div style="padding:8px 12px;">
        <div style="font-size:13px;color:#536471;">
          ${hostname}
        </div>

        <div style="font-weight:600;font-size:14px;margin-top:2px;">
          ${title}
        </div>

        <div style="font-size:13px;color:#536471;margin-top:2px;">
          ${description}
        </div>
      </div>
    `;

    wrapper.appendChild(
      card
    );

    return wrapper;
  }

  function escapeHtml(
    value
  ) {
    return String(value)
      .replaceAll(
        '&',
        '&amp;'
      )
      .replaceAll(
        '<',
        '&lt;'
      )
      .replaceAll(
        '>',
        '&gt;'
      )
      .replaceAll(
        '"',
        '&quot;'
      )
      .replaceAll(
        "'",
        '&#39;'
      );
  }

  function removeAllLinkCards() {
    document
      .querySelectorAll(
        '[data-ogp-card]'
      )
      .forEach(
        (el) => el.remove()
      );

    document
      .querySelectorAll(
        'article[data-ogp-fetching]'
      )
      .forEach(
        (el) => {
          delete el.dataset.ogpFetching;
        }
      );
  }

  function processArticle(
    article
  ) {
    if (
      !linkCardEnabledSetting.get()
    ) {
      return;
    }

    const url =
      extractUrl(article);

    const existingCard =
      article.querySelector(
        '[data-ogp-card]'
      );

    if (!url) {
      if (existingCard) {
        existingCard.remove();
      }

      delete article.dataset
        .ogpFetching;

      return;
    }

    if (existingCard) {
      if (
        existingCard.dataset
          .ogpCard === url
      ) {
        return;
      }

      existingCard.remove();

      delete article.dataset
        .ogpFetching;
    }

    if (
      article.dataset
        .ogpFetching === url
    ) {
      return;
    }

    article.dataset.ogpFetching =
      url;

    fetchOgp(
      url,
      (data) => {
        if (
          article.dataset
            .ogpFetching !== url
        ) {
          return;
        }

        delete article.dataset
          .ogpFetching;

        if (
          !linkCardEnabledSetting.get()
        ) {
          return;
        }

        if (!data) {
          return;
        }

        if (
          article.querySelector(
            '[data-ogp-card]'
          )
        ) {
          return;
        }

        article
          .querySelector('p')
          ?.insertAdjacentElement(
            'afterend',
            buildLinkCard(
              data,
              url
            )
          );
      }
    );
  }

  // ============================================================
  // Composer detection
  // ============================================================

  function isInsideComposer(
    el
  ) {
    if (!el) {
      return false;
    }

    const textareas =
      document.querySelectorAll(
        'textarea#public-tweet-input, textarea#public-modal-tweet-input'
      );

    for (
      const ta of textareas
    ) {
      const root =
        ta.parentElement
          ?.parentElement;

      if (
        root?.contains(el)
      ) {
        return true;
      }
    }

    return false;
  }

  // ============================================================
  // DOM observer
  // ============================================================

  function startObserving() {
    const observer =
      new MutationObserver(
        (mutations) => {
          let composerMayHaveChanged =
            false;

          mutations.forEach(
            (m) => {
              /*
               * 新しい要素が追加された場合。
               */
              m.addedNodes.forEach(
                (node) => {
                  if (
                    node.nodeType !== 1
                  ) {
                    return;
                  }

                  /*
                   * 投稿欄内部。
                   */
                  if (
                    isInsideComposer(
                      node
                    )
                  ) {
                    composerMayHaveChanged =
                      true;

                    return;
                  }

                  /*
                   * 新しく追加された投稿本文。
                   */
                  applyFontSizeToBodies(
                    node
                  );

                  /*
                   * 新しく追加された投稿欄。
                   */
                  applyFontSizeToComposers(
                    node
                  );

                  /*
                   * article。
                   */
                  if (
                    node.matches?.(
                      'article'
                    )
                  ) {
                    processArticle(
                      node
                    );
                  }

                  node
                    .querySelectorAll?.(
                      'article'
                    )
                    .forEach(
                      processArticle
                    );

                  /*
                   * textareaが追加された場合。
                   */
                  if (
                    node.matches?.(
                      'textarea#public-tweet-input, textarea#public-modal-tweet-input'
                    ) ||
                    node.querySelector?.(
                      'textarea#public-tweet-input, textarea#public-modal-tweet-input'
                    )
                  ) {
                    composerMayHaveChanged =
                      true;
                  }
                }
              );

              /*
               * テキスト変更。
               *
               * 投稿欄内部のIME入力中は
               * リンクカード処理を行わない。
               */
              if (
                m.type ===
                'characterData'
              ) {
                const targetEl =
                  m.target
                    .parentElement;

                if (
                  isInsideComposer(
                    targetEl
                  )
                ) {
                  composerMayHaveChanged =
                    true;

                  return;
                }

                const article =
                  targetEl?.closest?.(
                    'article'
                  );

                if (article) {
                  processArticle(
                    article
                  );
                }
              }
            }
          );

          /*
           * Reactによってミラー要素が再生成された場合に
           * フォントサイズを再適用する。
           *
           * applyStyles()は呼ばない。
           * style要素の変更をMutationObserverが拾うことによる
           * 不要な再処理を避ける。
           */
          if (
            composerMayHaveChanged
          ) {
            applyFontSizeToComposers();
          }
        }
      );

    observer.observe(
      document.body,
      {
        childList: true,
        subtree: true,
        characterData: true,
      }
    );
  }

  // ============================================================
  // Initialisation
  // ============================================================

  function init() {
    loadOgpCacheFromStorage();

    applyStyles();

    registerMenuCommands();

    startObserving();

    document
      .querySelectorAll(
        'article'
      )
      .forEach(
        processArticle
      );

    /*
     * Reactの初期描画直後に投稿欄が生成される場合に備える。
     */
    requestAnimationFrame(
      () => {
        applyFontSizeToComposers();
        applyFontSizeToBodies();
      }
    );

    setTimeout(
      () => {
        applyFontSizeToComposers();
        applyFontSizeToBodies();
      },
      500
    );
  }

  init();

})();
