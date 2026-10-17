# サキガキ — LEADLINE

転がる玉の、少し先の地面を描き続けるブラウザゲーム。

遊び方はゲームの中にも、この README にも書いていません。触って発見してください。
設計の意図と検証結果は [docs/DESIGN.md](docs/DESIGN.md) にあります（仕組みのネタバレを含みます）。

## 動かす

ビルドは不要です。リポジトリのルートを静的サーバーで配信して `index.html` を開きます。

```sh
npm start            # http://localhost:8080
```

- `?seed=123` を付けると、日替わりではなく指定したシードのコースになります。
- `M` キーで消音します。

## GitHub Pages で公開する

リポジトリの Settings → Pages で、Source を「Deploy from a branch」、
ブランチを `main`（フォルダは `/ (root)`）にすると、そのまま公開されます。
外部サービスは Google Fonts だけで、読み込めない場合も代替フォントで動きます。

## テスト

```sh
npm test             # 物理・ルール・上達の勾配のテスト（Node 20 以上）
npm run simulate     # ボットごとの到達距離を表示
npm run e2e          # Playwright で実ブラウザを操作するスモークテスト
node tests/e2e/visual.mjs [seed]   # 熟練ボットに遊ばせてスクリーンショットを保存
```

e2e は Playwright と Chromium が必要です（ローカルの `playwright` か、グローバルにインストールされたものを使います）。
スクリーンショットは `tests/e2e/out/` に出力されます。

## 構成

| ファイル | 役割 |
|---|---|
| `src/constants.js` | 調整値の一覧。速度に関わる値は `SPEED_SCALE` から導出 |
| `src/course.js` | シードから決まるコース（帯の勾配、裂け目、輪） |
| `src/terrain.js` | プレイヤーが描いた地面の標本 |
| `src/physics.js` | 玉の物理（重力・抵抗・接地・着地・衝突） |
| `src/game.js` | ルール、ペン、得点、終了判定。DOM に依存しない |
| `src/render.js` / `src/audio.js` / `src/input.js` | 描画、音、入力 |
| `src/storage.js` | 自己ベストとゴーストの保存 |
| `tests/bots.js` | 検証用のボット（何もしない、ランダム、計画する） |
