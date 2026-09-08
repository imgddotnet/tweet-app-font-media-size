# tweet-app-font-media-size

app.tweet.app のフォントサイズ・コンテンツ表示幅を調整し、ツイート本文中のURLにOGPリンクカードを表示するTampermonkeyユーザースクリプト。

無保証・無サポート。

## 機能

- **フォントサイズ変更**: ツイート本文・投稿編集欄の文字サイズをpx単位で指定
- **コンテンツ表示幅調整**: 画像・動画・リンクカードの表示幅をデフォルト / 3/4 / 1/2 から選択
- **リンクカード表示**: ツイート本文中のURLからOGP情報(タイトル・説明・画像)を取得し、リンクカードとして追加表示。ON/OFF切替可能

## インストール

1. [Tampermonkey](https://www.tampermonkey.net/) をブラウザにインストール
2. [tweet-app-font-media-size_user.js](./tweet-app-font-media-size_user.js) を開き、Tampermonkeyに追加

## 使い方

Tampermonkeyのメニューアイコンから以下を実行:

- **フォントサイズ変更**: pxで数値入力
- **画像・動画・リンクカードの幅を変更**: 100 / 75 / 50 を選択
- **リンクカード表示 ON/OFF**: トグル切替

設定はGM_setValueで保存され、次回以降も保持される。

## リンクカードの仕組み

- ツイート本文内のURLを検出し、`GM_xmlhttpRequest` で対象ページのHTMLを直接取得
- `DOMParser` で `og:title` / `og:image` / `og:description` を抽出してカードを生成
- 外部プロキシ・APIは使用しない(`@connect *` で全ドメインへの直接アクセスを許可)

### 制約

- OGPタグがJavaScriptで後から挿入されるサイト(SPA等)は、静的HTML取得のみのため対象外
- 対象ページのHTML全体を取得するため通信量はやや増える

## 動作環境

- Safari(Mac / iPhone / iPad)+ Tampermonkey で確認、他のwebブラウザやTampermonkey互換機能拡張では動作未確認
- `https://app.tweet.app/*` 専用

## ライセンス

MIT
