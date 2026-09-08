// ==UserScript==
// @name         Tweet.app フォント・画像サイズ変更
// @namespace    https://imgd.net/
// @version      1.4
// @description  app.tweet.app のツイート表示・編集欄のフォントサイズと画像/動画の表示幅を変更
// @match        https://app.tweet.app/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
  'use strict';

  const FONT_KEY = 'tweetapp_font_size_px';
  const DEFAULT_FONT_SIZE = 15;

  const MEDIA_KEY = 'tweetapp_media_width_pct';
  const MEDIA_OPTIONS = [100, 75, 50]; // デフォルト / 3/4 / 1/2
  const DEFAULT_MEDIA_PCT = 100;

  function getFontSize() {
    return GM_getValue(FONT_KEY, DEFAULT_FONT_SIZE);
  }

  function setFontSize(px) {
    GM_setValue(FONT_KEY, px);
    applyStyles();
  }

  function getMediaPct() {
    return GM_getValue(MEDIA_KEY, DEFAULT_MEDIA_PCT);
  }

  function setMediaPct(pct) {
    GM_setValue(MEDIA_KEY, pct);
    applyStyles();
  }

  let styleEl = null;

  function applyStyles() {
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'tweetapp-appearance-style';
      document.documentElement.appendChild(styleEl);
    }
    const fontSize = getFontSize();
    const mediaPct = getMediaPct();
    styleEl.textContent = `
      /* ツイート本文表示 */
      article p.text-tl-app-text,
      /* 投稿編集欄(textarea・通常/モーダル) */
      textarea#public-tweet-input,
      textarea#public-modal-tweet-input {
        font-size: ${fontSize}px !important;
        line-height: 1.5 !important;
      }

      /* 画像・動画の表示幅(単一/複数枚グリッド共通のラッパー) */
      article div.rounded-2xl.overflow-hidden {
        width: ${mediaPct}% !important;
        margin-left: auto !important;
        margin-right: auto !important;
      }
    `;
  }

  function promptFontSize() {
    const cur = getFontSize();
    const input = prompt('フォントサイズ(px)を入力', String(cur));
    if (input === null) return;
    const n = parseInt(input, 10);
    if (!Number.isFinite(n) || n <= 0) {
      alert('無効な数値');
      return;
    }
    setFontSize(n);
  }

  function promptMediaWidth() {
    const cur = getMediaPct();
    const labels = MEDIA_OPTIONS.map((pct) => {
      const label = pct === 100 ? 'デフォルト' : pct === 75 ? 'デフォルトの3/4' : 'デフォルトの1/2';
      return `${pct}: ${label}${pct === cur ? ' (現在)' : ''}`;
    }).join('\n');
    const input = prompt(`画像・動画の幅を選択\n${labels}`, String(cur));
    if (input === null) return;
    const n = parseInt(input, 10);
    if (!MEDIA_OPTIONS.includes(n)) {
      alert('100 / 75 / 50 のいずれかを入力');
      return;
    }
    setMediaPct(n);
  }

  GM_registerMenuCommand('フォントサイズ変更', promptFontSize);
  GM_registerMenuCommand('画像・動画の幅を変更', promptMediaWidth);

  applyStyles();
})();
