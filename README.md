# Airhive · 蜂群戰線 · エアハイヴ

A browser-based fixed-turret air-combat arcade game. No accounts, CDN, or runtime dependencies.

## English
Move with **← / →** or **A / D**, drag horizontally on touchscreens, or use the on-screen arrows. All weapons fire automatically. **P / Esc** or the pause button freezes combat. Collect upgrades, homing missiles, shields, bombs, extra lives, and repair kits. Enemy attacks reduce HP; **colliding with wreckage costs a life, even with a shield**. Every tenth wave brings a boss. Keep your combo to multiply your score, then enter a three-character callsign.

Weapons grow through ten tiers: spread fire, rapid fire, piercing rounds, built-in homing missiles, plasma blasts, rail rounds, and the seven-way Nova barrage. Ordinary waves have 33% fewer enemies than the previous version, rounded per wave, while shorter firing intervals remain. Enemy missiles keep their launch heading; only player weapons can home. After a death warning and explosion, choose **Continue challenge** to resume the current wave with remaining lives, or **Restart** from wave 1. With no lives left, the run ends; continuing is not allowed.

Switch language or adjust independent music/effects controls without restarting combat. Scores and settings stay on this device. Export JSON or a save code; imports show a preview and back up your previous save before replacement.

## 繁體中文
以 **← / →** 或 **A / D** 左右移動；觸控螢幕橫向拖曳，亦可使用畫面方向鍵。所有武器自動開火。**P / Esc** 或暫停鈕凍結戰鬥。接取火力、追蹤彈、護盾、炸彈、加命與補血；敵方攻擊扣 HP，**撞到殘骸會直接失去一條命，護盾也無效**。每十波出現 Boss，保持 COMBO 可增加分數，結算輸入三字元代號。

武器共十階，逐步解鎖扇形、速射、穿甲、內建追蹤彈、電漿爆破、磁軌與七向新星彈幕。一般波次敵機數在前版基礎上再減少 33%（逐波四捨五入），維持較短的攻擊間隔。所有敵方飛彈發射後不追蹤，只有玩家可使用追蹤武器。死亡提示與爆機特效後，可選 **繼續挑戰** 接續目前波次，或 **重新開始** 回到第 1 波；殘機耗盡後結算，不能續關。

語系與音樂／音效設定可隨時切換，不重啟遊戲。紀錄保存在本機，可匯出 JSON 或存檔碼；匯入會先預覽並備份舊檔。

## 日本語
**← / →** または **A / D** で左右に移動します。タッチ画面では横にドラッグするか、画面の矢印を使います。武器は自動発射。**P / Esc** または一時停止ボタンで戦闘を停止できます。強化・追尾弾・シールド・爆弾・残機・回復を回収してください。敵の攻撃は HP を減らしますが、**障害物への衝突はシールドがあっても残機を失います**。10 ウェーブごとにボスが登場。コンボでスコアを伸ばし、終了時に3文字のコールサインを登録します。

武器は全10段階。扇状射撃、連射、貫通弾、内蔵追尾ミサイル、プラズマ爆発、レール弾、7方向ノヴァ弾幕へ強化されます。通常ウェーブの敵機数は前版からさらに33%削減（ウェーブごとに四捨五入）し、短い攻撃間隔は維持。敵のミサイルは発射後に追尾せず、追尾武器はプレイヤーのみ使用できます。撃墜の通知と爆発後、残機があれば **挑戦を続ける** か **最初からやり直す** を選べます。残機が尽きると終了し、コンティニューはできません。

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

16 enemy types, eight rotating bosses, ten weapon tiers, six automatic pickups, a death/continue/restart flow, layered SVG artwork, 24 original FM scores, separate effects controls, and offline local saves are integrated. The runtime is plain ES modules with vendored OPM.js 1.1.0.

Enemy planning prefers WebGPU compute for formation placement/type selection and aimed/fan projectile geometry; attack timing and state transitions share the CPU's double-precision logic. Canvas 2D rendering, movement, and collisions stay on the main thread. The CPU module-worker pool starts immediately: reserve one reported logical core, cap at four workers, and precompute up to eight waves with attacks taking priority. If WebGPU is absent, initialization fails or exceeds five seconds, the device is lost, or a GPU job fails/exceeds one second, the same snapshot is replayed on CPU workers without restarting combat. Single-core/unsupported environments and failed or timed-out workers retain synchronous fallback. Both backends and their dependencies work offline; WebGPU requires localhost or HTTPS.

The start screen shows the active compute backend: **WebGPU**, **CPU multithreading (N threads)** using the actual worker count, or **CPU single thread**. The label follows GPU readiness, fallback, and language changes without a reload.

`npm test` passes 44 regression tests, including real worker threads, population rounding, GPU failure/disposal races, and fixed-heading enemy missiles. Real Chromium/Apple Metal smoke runs compare 126 wave plans and 57 attack batches against CPU results, then exercise live and offline device-loss recovery. Existing browser coverage includes keyboard/touch input, all three languages, responsive layouts, safe imports, and service-worker upgrades. GPU support is not a claim of improved frame rate: transfer overhead and device differences still require measurement. Device installation, listening review, and player-balance statistics remain manual checks in [ACCEPTANCE.md](ACCEPTANCE.md).

## Deployment / 部署 / 公開

Static GitHub Pages repository: <https://github.com/YueyuHoshizora/Airhive>.
Custom domain: `airhive.yustellar.dev`. The isolated CNAME commit has been pushed as explicitly requested; application commits remain local. `.nojekyll` is included. Enable Pages for the repository root and configure DNS as owner actions. Offline caches never remove localStorage saves; a new release activates after older game tabs close.

## License

Airhive: **AGPL-3.0**, see [LICENSE](LICENSE). Provided without warranty; redistribution under the license is permitted. Vendored OPM.js retains **Apache-2.0** and its notices. See [PLAN.md](PLAN.md) for the complete design and [ACCEPTANCE.md](ACCEPTANCE.md) for observed verification and remaining manual checks.
