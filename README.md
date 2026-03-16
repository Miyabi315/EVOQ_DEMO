# Hex Myth Duel

六角形ボードで遊ぶ、ローカル2人対戦のブラウザゲームです。

## 起動方法

### 一番簡単な方法

1. このフォルダの [index.html](/Users/tarutaru315/Downloads/ボードゲーム/index.html) をブラウザで開く
2. そのままゲーム開始

`HTML / CSS / JavaScript` だけで動くので、依存インストールは不要です。

### ローカルサーバーで開く方法

ターミナルでこのフォルダに移動して、次を実行します。

```bash
cd /Users/tarutaru315/Downloads/ボードゲーム
python3 -m http.server 8000
```

その後、ブラウザで次を開きます。

```text
http://localhost:8000
```

終了するときは、ターミナルで `Ctrl + C` を押してください。

## ファイル構成

- [index.html](/Users/tarutaru315/Downloads/ボードゲーム/index.html): 画面の構造
- [styles.css](/Users/tarutaru315/Downloads/ボードゲーム/styles.css): 見た目
- [main.js](/Users/tarutaru315/Downloads/ボードゲーム/main.js): ゲームルールと描画

## 補足

- 2人固定のローカル対戦です
- リロードすると対局状態はリセットされます
- `リスタート` ボタンでも初期状態に戻せます
