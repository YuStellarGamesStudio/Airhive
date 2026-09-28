# 執行 Agent 指南

先閱讀 `PLAN.md`、`DESIGN.md`、`ACCEPTANCE.md`。本倉庫只實作 Airhive；不得修改其他專案。

- 純 HTML/CSS/JavaScript ES modules，無框架、CDN 或 runtime 套件依賴。
- 入口為 `app.js`；所有玩法數值放 `src/data/`；資源放 `assets/`（根目錄 `favicon.ico` 例外）。
- 固定 960×540 戰場、橫向移動、自動開火；不得增加開火鍵或縱向移動。
- 三語必須原地更新，不能重載或重建遊戲。開始畫面先於戰鬥。
- 所有音訊使用已發佈 OPM.js 4-op FM；保留上游授權與版本。禁止錄音檔。
- SVG 保留漸層、光影、細節；WebGPU 繪製敵我機體、煙霧／受擊粒子、bloom 與扭曲震動，保留完整 Canvas 備援及減少動態效果支援。
- 匯入必須驗證、預覽、確認前備份；失敗保留原存檔。遊戲進行中設定只留記憶體，結算後落盤。
- **完成一項功能即自動 commit（不推送），禁止整包提交。** 每個里程碑完成使用 `M0:`–`M7:` 前綴。提交前檢查 diff，只包含該功能。
- **嚴禁 git push**。GitHub Pages 啟用與 DNS 由使用者處理，不宣稱已部署。
- 平行工作期間由整合者統一提交；不要自行 stage 其他人的檔案。
- 實作中不反覆 build/lint/test；完成整合後執行 `npm test`、`npm run assets:hash` 與真實瀏覽器驗證。
- 不將尚未觀察到的節奏、效能、實機安裝或聽感寫成通過。
- 永久修正後更新既有文件與驗收紀錄；不要把測試或暫用工具留在 production cache。
