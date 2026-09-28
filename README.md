# Airhive · 蜂群戰線 · エアハイヴ

A browser-based fixed-turret air-combat arcade game. No accounts, CDN, or runtime dependencies.

## English
Move with **← / →** or **A / D**, drag horizontally on touchscreens, or use the on-screen arrows. All weapons fire automatically. **P / Esc** or the pause button freezes combat. Collect upgrades, homing missiles, shields, bombs, extra lives, and repair kits. Enemy attacks reduce HP; **colliding with wreckage costs a life, even with a shield**. Every tenth wave brings a boss. Keep your combo to multiply your score, then enter a three-character callsign.

Switch language or adjust independent music/effects controls without restarting combat. Scores and settings stay on this device. Export JSON or a save code; imports show a preview and back up your previous save before replacement.

## 繁體中文
以 **← / →** 或 **A / D** 左右移動；觸控螢幕橫向拖曳，亦可使用畫面方向鍵。所有武器自動開火。**P / Esc** 或暫停鈕凍結戰鬥。接取火力、追蹤彈、護盾、炸彈、加命與補血；敵方攻擊扣 HP，**撞到殘骸會直接失去一條命，護盾也無效**。每十波出現 Boss，保持 COMBO 可增加分數，結算輸入三字元代號。

語系與音樂／音效設定可隨時切換，不重啟遊戲。紀錄保存在本機，可匯出 JSON 或存檔碼；匯入會先預覽並備份舊檔。

## 日本語
**← / →** または **A / D** で左右に移動します。タッチ画面では横にドラッグするか、画面の矢印を使います。武器は自動発射。**P / Esc** または一時停止ボタンで戦闘を停止できます。強化・追尾弾・シールド・爆弾・残機・回復を回収してください。敵の攻撃は HP を減らしますが、**障害物への衝突はシールドがあっても残機を失います**。10 ウェーブごとにボスが登場。コンボでスコアを伸ばし、終了時に3文字のコールサインを登録します。

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

## Deployment / 部署 / 公開

Static GitHub Pages repository: <https://github.com/YueyuHoshizora/Airhive>.
Custom domain: `airhive.yustellar.dev`. Push and DNS configuration are manual owner actions. Offline caches never remove localStorage saves. New versions activate on a later visit after older tabs close.

## License

Airhive: **AGPL-3.0**, see [LICENSE](LICENSE). Provided without warranty; redistribution under the license is permitted. Vendored OPM.js retains **Apache-2.0** and its notices. See [PLAN.md](PLAN.md) for the complete design and [ACCEPTANCE.md](ACCEPTANCE.md) for observed verification and remaining manual checks.
