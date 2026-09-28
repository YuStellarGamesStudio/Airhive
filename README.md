# Airhive · 蜂群戰線 · エアハイヴ

A browser-based fixed-turret air-combat arcade game. No accounts, CDN, or runtime dependencies.

## English
Move with **← / →** or **A / D**, drag horizontally on touchscreens, or use the on-screen arrows. All weapons fire automatically. **P / Esc** or the pause button freezes combat. Collect upgrades, homing missiles, shields, bombs, extra lives, and repair kits. Enemy attacks reduce HP; **colliding with wreckage costs a life, even with a shield**. Every tenth wave brings a boss. Keep your combo to multiply your score, then enter a three-character callsign.

Weapons grow through ten tiers: spread fire, rapid fire, piercing rounds, built-in homing missiles, plasma blasts, rail rounds, and the seven-way Nova barrage. Ordinary waves carry about 2.25 times the original enemy count (25% fewer than the tripled version), with shorter firing intervals.

Switch language or adjust independent music/effects controls without restarting combat. Scores and settings stay on this device. Export JSON or a save code; imports show a preview and back up your previous save before replacement.

## 繁體中文
以 **← / →** 或 **A / D** 左右移動；觸控螢幕橫向拖曳，亦可使用畫面方向鍵。所有武器自動開火。**P / Esc** 或暫停鈕凍結戰鬥。接取火力、追蹤彈、護盾、炸彈、加命與補血；敵方攻擊扣 HP，**撞到殘骸會直接失去一條命，護盾也無效**。每十波出現 Boss，保持 COMBO 可增加分數，結算輸入三字元代號。

武器共十階，逐步解鎖扇形、速射、穿甲、內建追蹤彈、電漿爆破、磁軌與七向新星彈幕。一般波次敵機數為原本約 2.25 倍（三倍版本再減少 25%），維持較短的攻擊間隔。

語系與音樂／音效設定可隨時切換，不重啟遊戲。紀錄保存在本機，可匯出 JSON 或存檔碼；匯入會先預覽並備份舊檔。

## 日本語
**← / →** または **A / D** で左右に移動します。タッチ画面では横にドラッグするか、画面の矢印を使います。武器は自動発射。**P / Esc** または一時停止ボタンで戦闘を停止できます。強化・追尾弾・シールド・爆弾・残機・回復を回収してください。敵の攻撃は HP を減らしますが、**障害物への衝突はシールドがあっても残機を失います**。10 ウェーブごとにボスが登場。コンボでスコアを伸ばし、終了時に3文字のコールサインを登録します。

武器は全10段階。扇状射撃、連射、貫通弾、内蔵追尾ミサイル、プラズマ爆発、レール弾、7方向ノヴァ弾幕へ強化されます。通常ウェーブの敵機数は初期版の約2.25倍（3倍版から25%削減）で、短い攻撃間隔は維持。

言語・BGM・効果音はゲームを再起動せず変更できます。記録は端末内に保存されます。JSON とセーブコードの書き出しに対応。読み込みはプレビューと旧データのバックアップ後に実行されます。

## Local development / 本機啟動 / ローカル起動

```sh
npm run dev
```

Open `http://localhost:4173`. Serve over localhost or HTTPS for AudioWorklet and offline installation; do not open `index.html` using `file://`.

```sh
npm test
npm run assets:hash
npm run assets:check
```

The entrypoints are `index.html`, `app.js`, and `app.css`. Run `npm run assets:hash` after changing code or assets, then commit the updated HTML, asset map, and service worker together. `assets:check` rejects stale fingerprints.

## Implemented / 已實作 / 実装済み

16 enemy types, eight rotating bosses, ten weapon tiers, six automatic pickups, layered SVG artwork, 24 original FM scores, separate effects controls, and offline local saves are integrated. The runtime is plain ES modules with vendored OPM.js 1.1.0.

`npm test` passes 19 regression tests. Real Chromium smoke runs cover keyboard/touch input, all three languages, responsive layouts, safe imports, service-worker upgrades, and a complete sortie with the HTTP server stopped. Device installation, listening review, and player-balance statistics remain manual checks in [ACCEPTANCE.md](ACCEPTANCE.md).

## Deployment / 部署 / 公開

Static GitHub Pages repository: <https://github.com/YueyuHoshizora/Airhive>.
Custom domain: `airhive.yustellar.dev`. The isolated CNAME commit has been pushed as explicitly requested; application commits remain local. `.nojekyll` is included. Enable Pages for the repository root and configure DNS as owner actions. Offline caches never remove localStorage saves; a new release activates after older game tabs close.

## License

Airhive: **AGPL-3.0**, see [LICENSE](LICENSE). Provided without warranty; redistribution under the license is permitted. Vendored OPM.js retains **Apache-2.0** and its notices. See [PLAN.md](PLAN.md) for the complete design and [ACCEPTANCE.md](ACCEPTANCE.md) for observed verification and remaining manual checks.
