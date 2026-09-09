# tweet-app-font-media-size

app.tweet.app のフォントサイズ・コンテンツ表示幅を調整し、ツイート本文中のURLにOGPリンクカードを表示し、常時表示の投稿欄・動画/GIF自動再生をON/OFF切替できるTampermonkeyユーザースクリプト。

無保証・無サポート。

## 機能

- **フォントサイズ変更**: ツイート本文・投稿編集欄の文字サイズをプリセット(15px / 18px / 22px)からタップ選択
- **コンテンツ表示幅調整**: 画像・動画・リンクカードの表示幅をプリセット(デフォルト100% / 中75% / 小50%)からタップ選択
- **リンクカード表示**: ツイート本文中のURLを検出しOGP情報(タイトル・説明・画像)を取得、リンクカードとして追加表示。ON/OFF切替可能
- **投稿欄表示切替**: 画面上部に常時表示される投稿欄(ツイート編集欄)をON/OFF切替可能。返信用モーダルの投稿欄には影響しない
- **動画/GIF自動再生切替**: ツイートに添付された動画・アニメGIFの自動再生をON/OFF切替可能。OFF時もユーザーが手動で再生ボタンを押した場合は再生を妨げない
- **リンクカードのキャッシュ**: 取得したOGP情報を`GM_setValue`で永続化(TTL 7日、上限300件)。リロードのたび再取得しない。手動削除も可能

## インストール

1. [Tampermonkey](https://www.tampermonkey.net/) をブラウザにインストール
2. [tweet-app-font-media-size.user.js](./tweet-app-font-media-size.user.js) を開き、Tampermonkeyに追加

## 使い方

Tampermonkeyのメニューアイコンから以下を実行(すべてタップ選択式のパネルで選ぶ、テキスト入力は不要):

- **Change font size**: 15px / 18px / 22px から選択
- **Change content width**: Default(100%) / Medium(75%) / Small(50%) から選択
- **Composer visibility ON/OFF**: Show / Hide から選択
- **Video/GIF autoplay ON/OFF**: ON / OFF から選択
- **Link card ON/OFF**: ON / OFF から選択
- **Clear link card cache**: 保存済みOGPキャッシュを削除

メニュー項目名・選択パネルの表示は英語。設定は`GM_setValue`で保存され、次回以降も保持される。

## リンクカードの仕組み

- ツイート本文内のURLを検出し、`GM_xmlhttpRequest` で対象ページのHTMLを直接取得
- `DOMParser` で `og:title` / `og:image` / `og:description` を抽出してカードを生成
- 外部プロキシ・APIは使用しない(`@connect *` で全ドメインへの直接アクセスを許可)
- カードは元のURLテキストの直後に追加挿入される(元URL表示はそのまま残る)

### 制約

- OGPタグがJavaScriptで後から挿入されるサイト(SPA等)は、静的HTML取得のみのため対象外
- 対象ページのHTML全体を取得するため通信量はやや増える

## フォントサイズ変更の仕組み

- CSSではなく各要素へのインラインstyleで直接指定する。TailwindのCSS Cascade Layersにより、CSS(`!important`含む)での上書きがアプリ側のスタイルに負けるケースがあったため
- 投稿欄(textarea)は、実際の入力欄と見た目のテキストを描画するミラー要素(`aria-hidden`)の二層構造になっており、両方に同じフォントサイズを適用する。行間(line-height)はアプリ本来の値から変更しない(変更するとキャレット位置と表示テキストがズレる不具合があったため)

## 動画/GIF自動再生切替の仕組み

- `@run-at document-start` で早期に読み込み、`play`/`playing`イベントをキャプチャフェーズで監視してOFF時は即座に一時停止する(`autoplay`属性の有無やReactによる再描画のタイミングに依存しないようにするため)
- ユーザーが実際に再生ボタン等を操作した場合は一定時間(1.5秒)、手動再生として自動停止の対象から除外する

## 動作環境

- Safari(Mac / iPhone / iPad)+ Tampermonkey で確認、他のwebブラウザやTampermonkey互換機能拡張では動作未確認
- 投稿欄表示切替はCSS `:has()` を使用(Safari 15.4以降で対応)
- `https://app.tweet.app/*` 専用

## ライセンス

MIT
