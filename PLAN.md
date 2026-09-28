# 《蜂群戰線》Airhive 遊戲企劃書

> 狀態：草案 v1，待審稿。所有設計決議見第 11 節。
> 英文名 **Airhive**、網址 slug `airhive`（決議 #9）；中文名《蜂群戰線》暫定，如需另議再裁示。

---

## 1. 遊戲概要

**一句話**：一款寫實軍武插畫風的復古固定炮台射擊遊戲——在無限蜂群敵機的波次中走位、射擊、接道具，挑戰最高分。

| 項目 | 內容 |
| --- | --- |
| 類型 | 固定炮台式射擊（小蜜蜂／Galaga-like） |
| 平台 | 純網頁（桌面＋行動瀏覽器） |
| 網址 | GitHub Pages，`airhive.yustellar.dev` |
| 遠端倉庫 | `https://github.com/YueyuHoshizora/Airhive.git` |
| 儲存 | localStorage 免登入，匯出／匯入雙軌 |
| 語言 | 英文預設，繁中／日文（`?lang=zh/en/ja`） |
| 調性 | 寫實軍武插畫 × 16-bit FM 電子音的復古反差 |
| 受眾 | 射擊遊戲愛好者、復古街機玩家、挑戰高分型玩家 |
| 網頁功能 | PWA（可安裝、離線）＋favicon.ico（決議 #22） |
| 版權 | **AGPL-3.0**（決議 #24） |

**調性原則（貫穿設計的硬規則）**
1. 爽感優先：開火、命中、爆炸的回饋每一幀都要在，寧可砍系統不可砍打擊感。
2. 一局五到十分鐘：隨時開、隨時死、隨時想再來一次。
3. 視覺真實化：SVG 精緻分層繪製，禁止像素風、禁止簡單色塊敷衍。
4. 音訊復古：全部音樂音效由 OPM.js（自研 4-op FM 引擎）即時合成，不使用錄音檔。
5. 所有數值集中在 `src/data/`，程式碼不寫死數字。

## 2. 核心循環

```
自動開火 → 敵機爆開＋得分×COMBO → 掉落道具（冒險接取・自動啟用）
    ↑                              ↓
 整排補位・波次加壓 ← 火力提升・護盾・炸彈
    ↓
 死亡 → 結算・輸入名字 → 高分榜 → 再來一局
```

**節奏目標表**

| 節點 | 目標時間 | 護欄 |
| --- | --- | --- |
| 首次爆機爽感 | 進戰場後 3 秒內 | 開始畫面到戰場 ≤ 1 點擊；進場即自動開火 |
| 首次道具掉落 | 30 秒內 | 前 3 波必掉 1 個道具 |
| 首次死亡體驗 | 1–3 分鐘 | 第 1–3 波不放俯衝機集火 |
| 首次 Boss（第 10 波） | 3–5 分鐘 | 第 10 波前難度不得反超 Boss 難度 |
| 一局標準時長 | 5–10 分鐘 | 前 10 波累計死亡率 ≥ 80% |
| 二周目動機 | 死亡後 ≤ 5 秒到「再來一局」 | 結算畫面不設多層選單 |

## 3. 數值系統

### 3.1 玩家

| 數值 | 目標 | 護欄 |
| --- | --- | --- |
| 生命值 | HP 100；HP 歸零失去一條命，選擇繼續後回滿 HP | 基礎 3 條命，每 250,000 分加命（上限 +5）；目標局長 5–10 分鐘，尚需玩家試玩校準 |
| 移動 | 電腦：← → 或 **A/D** 橫移；行動：觸控拖曳移動（原生）。320 px/s（基準畫布 960×540） | 不可上下移動（決議 #2） |
| 開火 | **全程自動開火**；主武器每 0.125–0.09 秒一輪，彈速 900 px/s | 無開火鍵；玩家與敵方彈池獨立，上限各 64／60 發 |
| 受擊判定 | **非一擊即死**：受敵機攻擊扣 HP（傷害見 3.4）；判定框為機身 50% | 護盾可擋下一次敵機攻擊；**障礙物碰撞例外（見 3.7）** |
| 死亡懲罰 | 火力降一級，道具全清 | 火力不低於 L1 |
| 暫停 | 暫停鍵（P／Esc）＋行動版暫停鈕；暫停時全遊戲凍結、自動開火停止 | 暫停中不計時、不掉血 |

### 3.2 火力等級

| 等級 | 形態 | 特性 |
| --- | --- | --- |
| L1 | 單發 | 開局配置，傷害 1 |
| L2 | 雙發 | 平行雙射 |
| L3 | 三發 | 平行三射 |
| L4 | 五向扇形 | 擴大覆蓋面 |
| L5 | 速射扇形 | 發射間隔縮至 0.09 秒 |
| L6 | 穿甲扇形 | 每發最多命中 3 架敵機，護盾可阻擋 |
| L7 | 導引火力 | 保留穿甲，內建每 0.6 秒一組雙追蹤彈 |
| L8 | 電漿爆破 | 直接傷害 2、間隔 0.125 秒；44px 範圍傷害 1，保留穿甲與雙追蹤彈 |
| L9 | 磁軌掃射 | 直接傷害 2、每發最多穿透 5 架、間隔 0.1 秒 |
| L10 | 新星彈幕 | 七向射擊、直接傷害 2、間隔 0.09 秒、60px 範圍傷害 2、每 0.4 秒三追蹤彈 |

所有火力形態**全程自動開火**（決議 #12/#13），玩家只控制移動。

穿甲／爆破彈對同一敵機最多傷害一次；道具追蹤彈與武器內建追蹤彈疊加。死亡先凍結戰鬥與局內時間，顯示原因並播放 1.2 秒爆機特效。有殘機時可選「繼續挑戰」（保留波次、分數及降級後火力）或「重新開始」（第 1 波、L1、三條命）；殘機耗盡後才結算且不能續關。

### 3.3 道具（多樣化，第 11 節決議 #4）

| 道具 | 效果 | 持續 | 掉率護欄 |
| --- | --- | --- | --- |
| ⚡ 火力升級 | 火力 +1 級，取得即自動開火 | 常駐（死亡降一級） | 每波掉率 25%，前 3 波必掉 1 |
| 🎯 追蹤彈 | 常駐副武器，自動鎖定最近敵機開火（與主火力併行） | 常駐（死亡失去） | 每波掉率 8% |
| 🛡 護盾 | 擋一次敵機攻擊，取得即自動生效；**不擋障礙物碰撞** | 直到觸發 | 每波掉率 50% |
| 💣 清屏炸彈 | 取得瞬間自動引爆，全畫面敵機爆開（得分減半） | 即時 | 每波掉率 5% |
| ＋ 加命 | 條命 +1（HP 回滿） | 永久 | 僅每 10 波保底評估 |
| ❤ 補血包 | 回復 30 HP（拾取自動使用，不超過上限） | 即時 | **擊落一般敵機時 1.84% 機率掉落**；Boss 必掉 1 |

**武器自動化（決議 #12/#13）**：全程自動開火；武器類道具取得後自行啟用並自動開火，無需任何操作；多武器可同時運作。

### 3.4 敵機

| 敵機 | 行為 | 攻擊方式 | 傷害 | 分數 | HP |
| --- | --- | --- | --- | --- | --- |
| E1 蜂群機 | 編隊橫移＋補位下壓 | 無射擊；接觸衝撞 | 10 | 100 | 1 |
| E2 俯衝機 | 脫隊高速俯衝開火 | 俯衝時單發直線彈 | 15 | 200 | 1 |
| E3 散射機 | 懸停三向散射 | 三向扇形彈（3 發齊射） | 12／發 | 300 | 2 |
| E4 自爆機 | 直線加速撞擊 | 自爆（接觸爆發） | 25 | 150 | 1 |
| E5 蟲型機 | 快速小隊蛇行接近 | 接觸衝撞 | 10 | 120 | 1 |
| E6 重型轟炸機 | 緩速推進、投彈 | 下墜炸彈（落地範圍爆） | 20 | 400 | 6 |
| E7 飛彈載具 | 中距懸停 | 瞄準發射當下位置的定向飛彈 2 連，離膛後不追蹤 | 15／發 | 350 | 3 |
| E8 幽影機 | 間歇隱形、突襲 | 顯形時單發直線彈 | 18 | 400 | 2 |
| E9 干擾機 | 遠距遊走 | 干擾彈（命中減速 2 秒） | 8 | 300 | 3 |
| E10 修理機 | 繞行友軍 | 無攻擊；為敵機回復 HP | — | 250 | 2 |
| E11 護盾機 | 緩速前推 | 接觸衝撞（自帶護盾） | 12 | 350 | 4＋護盾 |
| E12 機雷機 | 掠過投雷 | 機雷滯留（接觸爆發） | 20 | 300 | 2 |
| E13 攔截機 | 極速交叉掠過 | 掃射彈連 3 發 | 12／發 | 350 | 2 |
| E14 螺旋機 | 畫圓盤旋 | 螺旋擴散彈 | 10／發 | 450 | 3 |
| E15 殭屍機 | 被擊破後復活一次 | 接觸衝撞 | 15 | 200 | 2 |
| E16 空中母艦 | 停留投放無人機 | 投放 E1 無人機（本身不直射） | — | 500 | 8 |

**Boss（每 10 波，8 種風格循環）**

| Boss | 風格 | 主要攻擊 | 傷害 | 分數 |
| --- | --- | --- | --- | --- |
| B1 蜂巢母艦 | 召喚型：蜂群護航 | 水平彈幕＋召喚 E1／E5 | 10–12／發 | 3,000 |
| B2 雙叉戰斧 | 雙砲塔交叉 | 左右交叉掃射 | 12–15／發 | 3,500 |
| B3 雷鳴要塞 | 重砲陣列 | 大扇形彈幕＋蓄力雷射掃描 | 15–20 | 4,000 |
| B4 幽影刺客 | 隱形瞬移 | 瞬移後 5 連彈幕 | 14／發 | 4,500 |
| B5 機雷堡壘 | 區域封鎖 | 撒佈機雷＋護盾核心（需破盾） | 20（機雷） | 4,500 |
| B6 飛彈風暴 | 飛彈齊射 | 固定彈道飛彈 6 連＋召喚 E7，不使用追蹤彈 | 15／發 | 5,000 |
| B7 電漿巨像 | 近身衝撞 | 螺旋電漿＋衝撞 | 18–25 | 5,500 |
| B8 深淵核心 | 全機制混合（最終） | 三階段輪替：彈幕／召喚／衝撞 | 15–25 | 8,000 |

**Boss 規則**：每 10 波出現 1 隻，B1→B8 依序；第 90 波後循環並隨 3.5 成長係數加強；Boss 必掉補血包（決議 #32）。
**解鎖節奏**：前 3 波僅 E1／E2；E5–E16 自第 4 波起解鎖，每波新敵機 ≤ 2 種。

**傷害護欄**：玩家 HP 100；前 3 波累計承傷 ≤ 50 HP；同屏必然命中傷害不得在 5 秒內 ≥ 60 HP。補血包維持 1.84% 掉率：擊落 18／41／63 架一般敵機的期望掉落為 0.33／0.75／1.16 包；實際回復還受拾取與 HP 上限限制，Boss 保底另計。所有敵方飛彈發射後均不追蹤玩家，只有玩家可使用追蹤武器。Boss 彈幕必死角規則同 3.5。

### 3.5 波次難度（無限波次）

| 項目 | 成長 | 護欄 |
| --- | --- | --- |
| 敵機與 Boss HP | `ceil(基礎 HP × min(6, 1 + (波次 − 1) × 0.075) + Boss 循環加成)` | 一般成長上限 ×6；Boss 每完成 80 波另加 64 HP |
| 移速／俯衝速 | 每波 +3% | 上限 ×1.8 |
| 一般波次敵機數 | 三倍版本再減少 25%，即原數量約 2.25 倍：`round(2.25 × min(28, 8 + floor((波次 − 1) / 2)))` | 第 1／21／41 波為 18／41／63 架；每 0.3 秒出現一架，射擊間隔與波次時長不變 |
| 同螢敵機數 | 包含召喚機 | 上限 90 隻（失效槽重用） |
| 彈幕密度 | 一般敵機與 Boss 射擊間隔約減半，俯衝／攔截攻擊週期縮短；每 5 波再加壓 | 敵方彈池獨立保留 60 格，不被玩家火力占滿 |
| 編隊譜面 | 每波依波次號取樣式 | 同譜面至少 5 波內不重複 |
| Boss | 每 10 波 1 隻（B1→B8 循環） | 90 波後循環加強；Boss 戰不併發障礙物 |

敵機生成與攻擊共用核心自適應 Module Worker 池：依 `navigator.hardwareConcurrency` 回報的邏輯核心數保留一核、最多四個 Worker，預先規劃八波，優先處理逐步的瞄準／彈幕／召喚決策。主執行緒維持移動、碰撞與渲染，攻擊結果依原順序套用後才判定碰撞；暫停、死亡、換波及重開局丟棄過期結果。單核心、無效核心資訊、不支援、失敗或一秒逾時時回退同步計算，並支援離線執行。

Boss B1–B8 基礎 HP 為 **128／140／156／132／160／160／176／210**；十階火力及固定策略校準結果見 `DESIGN.md` 3.2／3.5。理論 DPS 與自動試跑不代表實際玩家表現，保留移動閃避與拾取的差異。

### 3.6 計分

- 擊墜分依 3.4 表；波次全清加成 `500 × 波次`；Boss 戰無盡數加成。
- 清屏炸彈擊殺得分減半（鼓勵省著用）。
- 連殺倍率（決議 #14）：連續擊墜 COMBO +1、受擊歸零；得分倍率套用 COMBO 數，**上限 COMBO 99**。
- 高分榜 Top 10，輸入三字元代號（街機式）。
- 擊破障礙物：50 分（見 3.7）。

### 3.7 障礙物（可擊破）

戰場隨機出現漂浮障礙物（戰機殘骸／隕石），自上方緩速漂移而過。

| 項目 | 內容 |
| --- | --- |
| 可擊破 | HP 3，自動開火可擊破（子彈優先鎖定？不鎖定——追蹤彈亦可誤擊） |
| 擊破獎勵 | 50 分 |
| **碰撞懲罰** | **撞上立即失去一條命——無視護盾、無視剩餘 HP，不扣算傷害，直接致死**（決議 #34） |
| 出現節奏 | 從第 3 波起出現；每波 0–2 個 |
| 護欄 | 同屏 ≤ 3 個；與敵機俯衝錯峰出現（同 5 秒窗不出現於同一水平區間）；出現前螢幕邊緣紅色警示 1 秒 |

## 4. 視覺與音效

**視覺（真實化＋SVG 繪製，第 11 節決議 #5/#6）**

- 色調：深藍暮色天空、雲層視差、金屬機身高光。
- 主角機：寫實噴射戰機側視 SVG，分層（機身／座艙／噴焰），轉彎傾斜、噴焰呼吸動畫。
- 敵機：16 種各有辨識剪影（蜂群密集編隊＋紅色警示燈、俯衝速度線、幽影斷續輪廓、母艦投艙）；Boss 8 種各有獨特輪廓、攻擊特效與出血條。
- 爆炸：Canvas 粒子（火團＋碎片＋煙霧殘留）＋螢幕震動。
- 子彈：曳光彈（亮芯＋光暈尾跡），非白點。
- Boss：出血條、階段變色、擊破慢鏡特寫。
- **硬性驗收**：SVG 資產須漸層、光影、細節三者齊備；所有機體 ≥ 2x 解析匯出測試不糊。

**音樂與音效（OPM.js 即時合成，決議 #7/#17–#19）**

| 類型 | 內容 |
| --- | --- |
| BGM | **24 首原創 FM 曲目**，主題符合本遊戲（空戰巡邏、蜂群壓境、Boss 戰、結算等情境） |
| SFX | 射擊、命中、爆機、道具、護盾破碎、炸彈、加命、升級、Game Over |
| 風格 | 16-bit FM 復古電子；與寫實畫面構成刻意反差（調性原則 4） |
| 播放 | **隨機播放**（洗牌清單循環，不連續重複同曲） |
| 交付 | 每首 BGM 單獨一個 JSON 檔，存於 `assets/audios/`；音色庫＋音序表隨遊戲檔發佈，零音檔資產 |

## 5. UI 佈局

```
桌面（≥1080px）               行動（<720px）
┌────────────────────┐       ┌────────────────┐
│  Score Wave ♥♥♥ W2 │       │ Score Wave ♥♥♥ │
│ ┌────────────────┐ │       │ ┌────────────┐ │
│ │                │ │       │ │            │ │
│ │  戰場 Canvas   │ │       │ │  Canvas    │ │
│ │    （16:9）    │ │       │ │（拖曳移動） │ │
│ └────────────────┘ │       │ └────────────┘ │
│   [◀] [▶]   [⏸]   │       │ [⏸] 全程自動開火│
└────────────────────┘       └────────────────┘
    （置中，不佔全寬）
```

- RWD 三斷點：寬（≥1080）／中（720–1079）／窄（<720）；`html/body/面板` 全程無捲軸。
- 電腦版（決議 #11）：遊戲區固定 16:9 置中，最大寬 960px；視窗更寬兩側留白，**不佔全畫面寬度**。
- 行動版（決議 #10）：**原生支援觸控**——按住戰場拖曳即移動飛機；拖放必備點選替代（備援虛擬 ◀▶ 鍵）；UI 觸控目標 ≥44px。
- 自動開火（決議 #12/#13）：無開火鍵；武器自行啟用並自動開火，玩家操作只剩移動（電腦：← →／A/D；行動：拖曳）（決議 #31）。
- 暫停（決議 #21）：暫停鍵 P／Esc＋固定暫停鈕（觸控目標 ≥44px）；暫停時遊戲凍結、自動開火與敵機行動全停、BGM 可持續播放；覆蓋式暫停畫面，不重載。
- 全網頁右鍵封鎖（決議 #16）：`contextmenu` 全頁 preventDefault，含戰場 Canvas 與所有 UI。
- 三語系（決議 #20）：中文／英文／日文原生三語版本，語系切換**不得重新整理遊戲畫面**、不得中斷進行中遊戲（狀態、波次、得分全保留）。
- 音量選單（決議 #36）：**BGM 與音效各自獨立開關＋音量滑桿（0–100）**；開始畫面與遊戲中 HUD 皆可存取；遊戲中調整立即生效、不暫停遊戲；開關狀態與音量值隨存檔保存。
- 開始畫面（決議 #35）：**開啟網站不直接進入遊戲**，先顯示開始畫面——遊戲標題、開始遊戲鈕、語言切換、**音量選單**、操作說明、高分榜預覽；點「開始遊戲」才進戰場。
- 畫面流：開始畫面 → 遊戲 → 結算（含高分榜、名字輸入）→ 回開始畫面。結算到再來一局 ≤ 5 秒。

## 6. 存檔設計

| 項目 | 內容 |
| --- | --- |
| 自動存檔 | 死亡結算、變更設定（音量／語言）時寫入 localStorage key `airhive-save-v1`（含 BGM／音效開關與音量值） |
| 存檔內容 | 高分榜 Top10、最高波次、累計局數、統計、設定 |
| 匯出 | .json 下載＋Base64 存檔碼雙軌 |
| 匯入 | 先顯示存檔摘要預覽（局數／最高分／日期），確認前自動備份現有檔至備援槽 `airhive-save-backup` |
| 例外 | 遊戲進行中不寫檔；匯入失敗保留原檔並顯示錯誤 |

## 7. 國際化

- 原生三語版本（決議 #20）：中文／英文／日文，語系路由 `?lang=zh|en|ja`＋History API 原地切換；預設英文。
- 偵測優先序：URL 參數 → localStorage 設定 → `navigator.language` → 英文。
- 翻譯範圍：全部 UI 字串、道具名、敵機名、結算文案；fallback 至英文。
- 一次只顯示一種語言。
- **切換語系不得重新整理遊戲畫面**（決議 #20）：僅更新 UI 文字，進行中遊戲狀態（波次、得分、道具、COMBO）原樣保留，不重載頁面、不重啟遊戲迴圈。

## 8. 技術方案

| 層 | 選型 |
| --- | --- |
| 架構 | 純前端 HTML/CSS/JS（ES modules），無框架、無 CDN |
| 繪製 | Canvas 2D 渲染；SVG 美術預先光柵化為 `Image`（避免每幀重解析）；粒子、曳光彈程式繪製 |
| 音效 | OPM.js **最新發佈版本**（Apache-2.0）收錄 `src/vendor/opm/`；來源 `https://github.com/YueyuHoshizora/OPM.js/releases`，記錄版本號 |
| 音樂資產 | 24 首 BGM 每首單獨 JSON，存 `assets/audios/`；播放器洗牌隨機播放 |
| 存檔 | localStorage＋匯出/匯入雙軌 |
| 數值 | 全數值集中 `src/data/`（敵機表、道具表、波次表、音色表） |
| 路由 | `?lang=`＋History API |
| 部署 | GitHub Pages，CNAME `airhive.yustellar.dev`；遠端倉庫 `https://github.com/YueyuHoshizora/Airhive.git` |
| PWA | 必做：standalone 安裝、iOS 加入主畫面、離線可玩（飛機模式驗收） |
| favicon | `favicon.ico` 置根目錄（決議 #26） |
| 檔案規範 | 全部資源收 `assets/`，根目錄只放必要檔案；主要 JS 入口命名 `app.js`（決議 #25/#27） |
| 授權 | **AGPL-3.0**；收錄之 OPM.js 保持其 Apache-2.0（相容） |

**PWA 細節**：SW 資產雜湊版本化（參考 `~/Documents/Code/StarwardBastion` 的 hash-assets 慣例）、不用 `ignoreSearch`、舊快取升級路徑驗證、更新不動存檔。

## 9. MVP 範圍

**做**
- 開始畫面（點擊開始才進遊戲）
- 音量選單（BGM／音效獨立開關＋滑桿）
- 玩家移動／自動開火／HP 生命值系統／補血包／加命
- 敵機 16 種（E1–E16）＋Boss 8 種（B1–B8）＋可擊破障礙物（碰撞即死）
- 道具 6 種（取得即自動啟用，含補血包）
- 連殺倍率（COMBO 上限 99）
- 無限波次＋難度曲線
- 高分榜＋名字輸入＋匯出匯入
- SVG 美術（主角機、4 敵機、Boss、背景）
- OPM.js 原創 BGM 24 首（隨機播放）＋SFX 9 種
- PWA（含 favicon.ico）＋RWD＋原生三語（切換不重整畫面）＋暫停鍵＋全網頁右鍵封鎖
- 文件六件：PLAN.md／ACCEPTANCE.md／DESIGN.md／AGENTS.md／CLAUDE.md／README.md（三語玩法說明）

**不做（明確排除）**
- 多人／排行榜伺服器／帳號
- 劇情、關卡制、章節
- 裝備與養成系統
- 橫向捲軸地圖（本作為固定炮台）
- 成就系統（v2 再議）

## 10. 開發階段

完整實作計畫見第 12 節（硬規則＋M0–M7 里程碑）。順序概要：

1. 專案骨架＋PWA 殼＋i18n 路由
2. 灰盒核心循環（移動、開火、編隊、碰撞、計分、死亡）
3. 敵機行為＋波次譜面
4. 道具系統＋火力等級
5. OPM.js 音訊整合
6. SVG 視覺資產＋特效打磨
7. 存檔／高分榜／RWD／部署

## 11. 決議紀錄

**已裁示（編號累計）**

| # | 決議 |
| --- | --- |
| 1 | 類型：小蜜蜂式固定炮台射擊 |
| 2 | 操作：經典固定炮台式——僅 ← → 橫移＋按住連射 |
| 3 | 結構：無限波次計分制，死亡結算進高分榜 |
| 4 | 道具：多樣化（火力／追蹤彈／護盾／清屏炸彈） |
| 5 | 視覺：盡可能真實化 |
| 6 | 美術：SVG 繪製（精緻分層，禁像素風） |
| 7 | 音訊：OPM.js 合成（自研引擎實戰） |
| 8 | 交付順序：先出完整設計文件（企劃書＋PLAN），之後再說實作 |
| 9 | 名稱：英文名 **Airhive**、slug `airhive`、存檔鍵 `airhive-save-*`（原 Q1 裁示）；中文名《蜂群戰線》暫定 |
| 10 | 介面：行動版原生支援觸控（拖曳移動為原生操作，備援虛擬 ◀▶ 鍵） |
| 11 | 介面：電腦版不佔全畫面寬度（遊戲區 16:9 置中、最大寬 960px） |
| 12 | 功能：全程自動開火，不設開火鍵（修訂 #2 之「按住連射」） |
| 13 | 功能：武器類道具取得後自行啟用並自動開火，無需操作；多武器可同時運作 |
| 14 | 遊戲：連殺倍率上限 COMBO 99（原 Q3 裁示） |
| 15 | 程式：OPM.js 以最新發佈版本收錄（`https://github.com/YueyuHoshizora/OPM.js/releases`）（原 Q4 裁示） |
| 16 | 介面：全網頁封鎖右鍵選單（含戰場與 UI） |
| 17 | 音樂：以 OPM.js 製作 **24 首原創 BGM**，主題符合本遊戲 |
| 18 | 音樂：每首 BGM 單獨 JSON 檔，存放於 `assets/audios/` |
| 19 | 音樂：**隨機播放** |
| 20 | 介面：原生三語系版本（中／英／日）；語系切換不得重新整理遊戲畫面，進行中遊戲狀態全保留 |
| 21 | 介面：暫停按鍵（P／Esc）＋暫停鈕；暫停時全遊戲凍結含自動開火 |
| 22 | 網頁功能：PWA（可安裝、離線）＋favicon.ico 必備 |
| 23 | 文件規範：M0 開工立刻建六件——PLAN.md（企劃書轉入）、ACCEPTANCE.md（驗收）、DESIGN.md（數值）、AGENTS.md（AI Agent 說明）、CLAUDE.md（直接引用 AGENTS.md）、README.md（遊戲說明及玩法，中英日三語） |
| 24 | 版權：**AGPL-3.0** |
| 25 | 檔案規範：所有資源放 `assets/`；根目錄只放必要的檔案 |
| 26 | favicon.ico 放根目錄 |
| 27 | 主要 JS 入口命名 `app.js` |
| 28 | 程式結構：遠端 git 倉庫 `https://github.com/YueyuHoshizora/Airhive.git` |
| 29 | 提交紀律：每完成一項功能即自動 commit（不推送），禁止整包提交；AGENTS.md 須載明此紀律 |
| 30 | 授權全文收錄於本企劃書附錄 A；M0 由附錄全文轉入根目錄 LICENSE 檔（實檔至開工才建立） |
| 31 | 介面：電腦版支援 ← → 與 A/D 鍵移動 |
| 32 | 遊戲：玩家改為 **HP 生命值系統**（不一擊即死，HP 100 歸零失一條命）；擊落一般敵機 **1.84% 機率掉補血包**（Boss 必掉） |
| 33 | 數值：各敵機攻擊方式與傷害定案——E1 接觸 10／E2 直線彈 15／E3 散射 12×3／E4 自爆 25／E5 Boss 彈幕 10–15＋召喚 |
| 34 | 遊戲：新增**可擊破障礙物**（HP 3、擊破 50 分）；**撞上立即死亡，無視護盾與剩餘 HP** |
| 35 | 介面：開啟網站不直接進入遊戲，先顯示**開始畫面**（標題、開始鈕、語言、音量、操作說明、高分榜預覽），點擊開始才進戰場 |
| 36 | 介面：新增**音量選單**——BGM 與音效各自獨立開關＋音量滑桿（0–100），開始畫面與遊戲中皆可調，設定隨存檔保存 |
| 37 | 遊戲：敵機擴充至 **16 種**（E1–E16，各含行為、攻擊方式、傷害） |
| 38 | 遊戲：Boss 設計 **8 種風格**（B1–B8，每 10 波依序登場、90 波後循環加強） |

**待裁示**

| # | 問題 | 建議 |
| --- | --- | --- |
（無——全部已裁示，見決議 #10–#38）

---

## 12. 實作計畫（原 PLAN.md 併入）

### 12.1 強制執行範圍（硬規則）

1. **本計畫只授權實作本遊戲**；不得延伸至其他專案、不得重構無關程式。
2. **嚴禁 `git push`**——由使用者親自推送。遠端倉庫固定為 `https://github.com/YueyuHoshizora/Airhive.git`。**提交紀律：每完成一項功能立即自動 commit（不推送）；禁止整包提交——一個 commit 對應一項功能，message 描述該功能本身。**
3. 每個里程碑 M 結束時 git commit，message 以 `M0:`–`M7:` 前綴開頭；里程碑內的個別功能 commit 不加 M 前綴（見規則 2 提交紀律）。
4. 純前端 HTML/CSS/JS（ES modules），**無框架、無 CDN、無 runtime 依賴**。
5. 所有數值集中 `src/data/`，其他檔案不寫死數字；數值以第 3 節為準（目標與護欄）。**例外：BGM 音樂資料每首單獨 JSON，存 `assets/audios/`（決議 #18）。**
6. 美術為 SVG 精緻分層繪製（漸層、光影、細節齊備），**禁止像素風或簡單色塊**。
7. 音訊全部由 OPM.js（4-op FM）即時合成，**禁止引入錄音檔**；以官方 GitHub Releases（`https://github.com/YueyuHoshizora/OPM.js/releases`）**最新發佈版本**收錄，不使用未發佈的開發中版本。
8. 存檔免登入：localStorage 自動存檔＋匯出/匯入雙軌；匯入前自動備份至備援槽。
9. PWA 必做：可安裝、離線可玩（飛機模式為驗收）、SW 資產雜湊版本化、不用 `ignoreSearch`、更新不動存檔。
10. RWD 硬性：全 UI 無捲軸、三斷點、觸控目標 ≥44px。
11. 多語系：原生中／英／日三語，`?lang=zh|en|ja`＋History API 切換；預設英文；一次只顯示一種語言；**切換不得重新整理遊戲畫面、不得中斷進行中遊戲**。
12. 文件與程式中以「執行 Agent」泛稱 AI 工具，不綁特定工具名。
13. 與第 1–11 節設計條文衝突時，以第 1–11 節為準。
14. 操作硬規則（決議 #10–#13/#31）：全程自動開火、無開火鍵；武器取得自行啟用並自動開火；行動版原生拖曳移動；電腦版支援 ← → 與 **A/D** 鍵移動、遊戲區 16:9 置中、不佔全畫面寬度。
15. 介面與音樂硬規則（決議 #16–#19）：全網頁封鎖右鍵選單；24 首原創 BGM 為獨立 JSON 存 `assets/audios/`，隨機播放（不連續同曲）。
16. 暫停硬規則（決議 #21）：暫停鍵 P／Esc 與暫停鈕皆須可用；暫停時全遊戲凍結（含自動開火、敵機、波次計時）。
17. 文件硬規則（決議 #23/#29）：M0 開工時立刻建立 PLAN.md（企劃書內容轉入）、ACCEPTANCE.md（驗收）、DESIGN.md（數值）、AGENTS.md（AI Agent 說明）、CLAUDE.md（直接引用 AGENTS.md）、README.md（遊戲說明及玩法說明，含中英日三語版本）。**AGENTS.md 必須載明提交紀律：完成一項功能即自動 commit（不推送），禁止整包提交。**
18. 版權硬規則（決議 #24）：專案授權 **AGPL-3.0**；收錄之 OPM.js 保持其 Apache-2.0 授權與 NOTICE。
19. 檔案硬規則（決議 #25–#27）：所有資源（美術、音樂、圖示）一律放 `assets/`；根目錄只放必要檔案（入口、設定、文件）；`favicon.ico` 置根目錄；主要 JS 入口命名 `app.js`。

### 12.2 倉庫結構

```
airhive/                      # 倉庫 https://github.com/YueyuHoshizora/Airhive.git → airhive.yustellar.dev
├── index.html
├── app.js                    # 主要 JS 入口（決議 #27）
├── app.css
├── favicon.ico               # 根目錄（決議 #26）
├── manifest.webmanifest
├── sw.js                     # Service Worker（雜湊版本化）
├── CNAME
├── LICENSE                   # AGPL-3.0 全文（見企劃書附錄 A）
├── README.md                 # 遊戲說明及玩法（中／英／日三語）
├── PLAN.md                   # 實作計畫（企劃書轉入）
├── ACCEPTANCE.md             # 驗收
├── DESIGN.md                 # 數值
├── AGENTS.md                 # AI Agent 說明
├── CLAUDE.md                 # 直接引用 AGENTS.md
├── assets/                   # 全部資源（決議 #25）
│   ├── art/                  # SVG 美術資產
│   ├── audios/               # 24 首 BGM JSON（每首一個檔）
│   └── icons/                # PWA 圖示
├── src/                      # 遊戲模組（非入口）
│   ├── core/                 # 遊戲迴圈、碰撞、波次、計分
│   ├── entities/             # 玩家、敵機、子彈、道具
│   ├── data/                 # 全部數值（敵機表、Boss 表、道具表、波次表、音色表）
│   ├── audio/                # OPM.js 整合層
│   ├── vendor/opm/           # OPM.js 最新發佈版（Apache-2.0，保留 LICENSE＋版本號）
│   ├── render/               # Canvas 渲染、粒子、特效
│   ├── save/                 # 存檔、匯出匯入
│   └── i18n/                 # zh/en/ja 字串
├── test/                     # node --test
└── tools/                    # hash-assets、SVG 光柵化預檢
```

### 12.3 里程碑 M0–M7

**M0 專案骨架**
- 建倉庫（remote = `https://github.com/YueyuHoshizora/Airhive.git`）；**立刻建立文件六件**：PLAN.md（企劃書轉入）、ACCEPTANCE.md、DESIGN.md、AGENTS.md、CLAUDE.md、README.md（三語）（決議 #23）。
- index.html＋`app.js` 入口、ES modules、PWA 殼（manifest＋SW＋favicon.ico）、i18n 路由（`?lang=`＋History API）。
- 空畫面可安裝、離線可開。
- 驗收：`?lang=ja` 可切換且不重載；飛機模式開頁不報錯。
- commit：`M0: 專案骨架＋PWA 殼＋i18n 路由`

**M1 灰盒核心循環**
- 玩家 ← →／A/D 移動、自動開火、受擊判定、死亡與 3 條命。
- 敵機 E1 編隊橫移＋補位下壓；碰撞、擊墜、計分。
- 灰盒方塊即可，不等美術。
- 驗收：可玩 1 分鐘不斷幀；判定框、彈速依 3.1。
- commit：`M1: 灰盒核心循環`

**M2 敵機行為＋波次譜面**
- 16 種敵機（E1–E16 各自行為＋攻擊＋傷害）、8 種 Boss（B1–B8 每 10 波循環、多階段）。
- 障礙物：可擊破（HP 3）、撞上即死（無視護盾與 HP）；同屏 ≤3、錯峰＋邊緣警示。
- 無限波次難度曲線（HP/速/密度成長＋護欄）；編隊譜面取樣式。
- 驗收：前 10 波死亡率與第 2 節節奏目標表對齊；同屏 ≤90 隻。
- commit：`M2: 敵機行為＋波次譜面`

**M3 道具系統＋火力等級**
- 火力 L1–L10（速射、穿甲、內建追蹤彈、電漿／新星範圍傷害）、護盾、清屏炸彈、加命；掉落率與前 3 波保底。
- 死亡降級、清道具；爆機提示與特效後顯示繼續／重新開始，殘機耗盡則結算。
- 驗收：首道具 ≤30 秒；炸彈得分減半生效。
- commit：`M3: 道具系統＋火力等級`

**M4 OPM.js 音訊整合**
- 收錄 OPM.js 最新發佈版（releases 頁面）；**24 首原創 BGM**（主題符合本遊戲）每首單獨 JSON 存 `assets/audios/`，隨機播放；＋SFX 9 種；音色庫＋音序表。
- 音量設定與靜音鍵。
- 驗收：全部音訊為 FM 即時合成（無音檔資產）；隨機播放不連續同曲、切換無爆音。
- commit：`M4: OPM.js 音訊整合`

**M5 SVG 視覺資產＋特效**
- 主角機（分層＋噴焰＋傾斜）、E1–E16＋B1–B8、背景視差雲層、曳光彈、爆炸粒子、螢幕震動、Boss 出血條＋擊破慢鏡。
- 驗收：SVG 三要素（漸層／光影／細節）人工檢視通過；2x 解析不糊。
- commit：`M5: SVG 視覺資產＋特效`

**M6 存檔／高分榜／RWD**
- localStorage 自動存檔、Top10 高分榜＋三字元名字輸入、匯出/匯入（.json＋Base64、預覽＋備援槽）。
- RWD 三斷點、虛擬鍵、無捲軸全檢。
- 驗收：匯入覆蓋前備份存在；三斷點 UI 完整。
- commit：`M6: 存檔／高分榜／RWD`

**M7 PWA 完成＋部署**
- SW 雜湊版本化＋舊快取升級驗證；離線全資產可用。
- 部署 GitHub Pages＋CNAME；三語全文覆檢。
- 驗收：飛機模式全流程可玩一局；更新版本不動存檔。
- commit：`M7: PWA 完成＋部署`
- **由使用者親自 push 與設定 DNS。**

### 12.4 技術要點

- SVG 以 `<img>` 預光柵化後 `drawImage`，避免每幀解析 SVG。
- 遊戲迴圈 `requestAnimationFrame`＋固定步長積分（碰撞判定穩定）。
- 子彈物件池（回收），防 GC 抖動；同屏彈數上限 20。
- 音訊：使用者首次互動後才啟動 AudioContext（自動播放政策）。
- 自動開火：道具事件僅驅動狀態變更，射擊由統一的自動開火排程處理（決議 #12/#13）。
- 隨機播放：洗牌 24 曲清單循環、曲終自動換曲，不連續重複同曲（決議 #19）。
- 右鍵封鎖：`contextmenu` 全頁 preventDefault，Canvas 與 UI 皆生效（決議 #16）。
- 提交節奏（決議 #29）：一項功能完成 = 一次 commit；禁止一次 commit 整個里程碑；不推送。
- SW 更新流程：安裝新 SW → 用戶端換頁時生效 → 不清存檔 key。
- hash-assets：JS/CSS/SVG 請求參數帶內容雜湊（參考 `~/Documents/Code/StarwardBastion` 慣例）。

### 12.5 驗收硬指標

| 指標 | 門檻 |
| --- | --- |
| 開局到開火 | 開始畫面 1 點擊進場，即自動開火 |
| 同屏敵機 | ≤ 40 |
| 同屏子彈 | ≤ 20 |
| 首道具 | ≤ 30 秒 |
| 一局時長中位數 | 5–10 分鐘 |
| 離線遊玩 | 飛機模式完整一局 |
| BGM | 24 首齊備、隨機播放、無連續同曲 |
| 右鍵封鎖 | 全網頁 contextmenu 無反應 |
| 三語切換 | 進行中切語系不重整畫面、遊戲狀態原樣保留 |
| 暫停 | P／Esc／暫停鈕皆有效；暫停中全遊戲凍結 |
| 障礙物碰撞 | 無視護盾與剩餘 HP 直接致死；可被擊破（HP 3） |
| 開始畫面 | 開站不自動進遊戲；點「開始遊戲」才進戰場 |
| 敵機／Boss | 16 種敵機＋8 種 Boss 全數實裝且行為各異 |
| 音量選單 | BGM／音效開關＋滑桿獨立生效；設定隨存檔保存 |
| 存檔安全 | 匯入必備份、更新不動檔 |
| 三語 | UI 全覆蓋、切換不重載 |
| 無捲軸 | 三斷點均無 scroll |

### 12.6 交付前自檢

- [x] 第 11 節待裁示全數轉決議（#10–#19）
- [ ] 右鍵封鎖逐頁驗證（含 canvas 與 UI）
- [ ] 遊戲進行中切換三語，確認畫面不重整、狀態保留
- [ ] 暫停鍵 P／Esc 與暫停鈕皆驗證凍結行為
- [ ] 文件六件齊備（PLAN／ACCEPTANCE／DESIGN／AGENTS／CLAUDE／README 三語）
- [ ] favicon.ico 於根目錄；LICENSE 為 AGPL-3.0（全文自附錄 A 轉入）
- [ ] 全部資源在 assets/，根目錄無多餘檔案
- [ ] `node --test` 全綠
- [ ] 飛機模式一局完整測試
- [ ] 三語切換逐屏檢視
- [ ] 三斷點截圖留檔
- [ ] 匯出→匯入循環測試（含備援槽）
- [ ] SW 升級路徑實測（舊版→新版不動存檔）
- [ ] git log 確認 M0–M7 前綴齊全、無 push 遺留

---

---

## 附錄 A：GNU AGPL-3.0 授權全文

以下為本專案授權 AGPL-3.0 之完整條文（GNU 官網正本）。實作（M0）時由本附錄全文轉入根目錄 `LICENSE` 檔。

```
                    GNU AFFERO GENERAL PUBLIC LICENSE
                       Version 3, 19 November 2007

 Copyright (C) 2007 Free Software Foundation, Inc. <https://fsf.org/>
 Everyone is permitted to copy and distribute verbatim copies
 of this license document, but changing it is not allowed.

                            Preamble

  The GNU Affero General Public License is a free, copyleft license for
software and other kinds of works, specifically designed to ensure
cooperation with the community in the case of network server software.

  The licenses for most software and other practical works are designed
to take away your freedom to share and change the works.  By contrast,
our General Public Licenses are intended to guarantee your freedom to
share and change all versions of a program--to make sure it remains free
software for all its users.

  When we speak of free software, we are referring to freedom, not
price.  Our General Public Licenses are designed to make sure that you
have the freedom to distribute copies of free software (and charge for
them if you wish), that you receive source code or can get it if you
want it, that you can change the software or use pieces of it in new
free programs, and that you know you can do these things.

  Developers that use our General Public Licenses protect your rights
with two steps: (1) assert copyright on the software, and (2) offer
you this License which gives you legal permission to copy, distribute
and/or modify the software.

  A secondary benefit of defending all users' freedom is that
improvements made in alternate versions of the program, if they
receive widespread use, become available for other developers to
incorporate.  Many developers of free software are heartened and
encouraged by the resulting cooperation.  However, in the case of
software used on network servers, this result may fail to come about.
The GNU General Public License permits making a modified version and
letting the public access it on a server without ever releasing its
source code to the public.

  The GNU Affero General Public License is designed specifically to
ensure that, in such cases, the modified source code becomes available
to the community.  It requires the operator of a network server to
provide the source code of the modified version running there to the
users of that server.  Therefore, public use of a modified version, on
a publicly accessible server, gives the public access to the source
code of the modified version.

  An older license, called the Affero General Public License and
published by Affero, was designed to accomplish similar goals.  This is
a different license, not a version of the Affero GPL, but Affero has
released a new version of the Affero GPL which permits relicensing under
this license.

  The precise terms and conditions for copying, distribution and
modification follow.

                       TERMS AND CONDITIONS

  0. Definitions.

  "This License" refers to version 3 of the GNU Affero General Public License.

  "Copyright" also means copyright-like laws that apply to other kinds of
works, such as semiconductor masks.

  "The Program" refers to any copyrightable work licensed under this
License.  Each licensee is addressed as "you".  "Licensees" and
"recipients" may be individuals or organizations.

  To "modify" a work means to copy from or adapt all or part of the work
in a fashion requiring copyright permission, other than the making of an
exact copy.  The resulting work is called a "modified version" of the
earlier work or a work "based on" the earlier work.

  A "covered work" means either the unmodified Program or a work based
on the Program.

  To "propagate" a work means to do anything with it that, without
permission, would make you directly or secondarily liable for
infringement under applicable copyright law, except executing it on a
computer or modifying a private copy.  Propagation includes copying,
distribution (with or without modification), making available to the
public, and in some countries other activities as well.

  To "convey" a work means any kind of propagation that enables other
parties to make or receive copies.  Mere interaction with a user through
a computer network, with no transfer of a copy, is not conveying.

  An interactive user interface displays "Appropriate Legal Notices"
to the extent that it includes a convenient and prominently visible
feature that (1) displays an appropriate copyright notice, and (2)
tells the user that there is no warranty for the work (except to the
extent that warranties are provided), that licensees may convey the
work under this License, and how to view a copy of this License.  If
the interface presents a list of user commands or options, such as a
menu, a prominent item in the list meets this criterion.

  1. Source Code.

  The "source code" for a work means the preferred form of the work
for making modifications to it.  "Object code" means any non-source
form of a work.

  A "Standard Interface" means an interface that either is an official
standard defined by a recognized standards body, or, in the case of
interfaces specified for a particular programming language, one that
is widely used among developers working in that language.

  The "System Libraries" of an executable work include anything, other
than the work as a whole, that (a) is included in the normal form of
packaging a Major Component, but which is not part of that Major
Component, and (b) serves only to enable use of the work with that
Major Component, or to implement a Standard Interface for which an
implementation is available to the public in source code form.  A
"Major Component", in this context, means a major essential component
(kernel, window system, and so on) of the specific operating system
(if any) on which the executable work runs, or a compiler used to
produce the work, or an object code interpreter used to run it.

  The "Corresponding Source" for a work in object code form means all
the source code needed to generate, install, and (for an executable
work) run the object code and to modify the work, including scripts to
control those activities.  However, it does not include the work's
System Libraries, or general-purpose tools or generally available free
programs which are used unmodified in performing those activities but
which are not part of the work.  For example, Corresponding Source
includes interface definition files associated with source files for
the work, and the source code for shared libraries and dynamically
linked subprograms that the work is specifically designed to require,
such as by intimate data communication or control flow between those
subprograms and other parts of the work.

  The Corresponding Source need not include anything that users
can regenerate automatically from other parts of the Corresponding
Source.

  The Corresponding Source for a work in source code form is that
same work.

  2. Basic Permissions.

  All rights granted under this License are granted for the term of
copyright on the Program, and are irrevocable provided the stated
conditions are met.  This License explicitly affirms your unlimited
permission to run the unmodified Program.  The output from running a
covered work is covered by this License only if the output, given its
content, constitutes a covered work.  This License acknowledges your
rights of fair use or other equivalent, as provided by copyright law.

  You may make, run and propagate covered works that you do not
convey, without conditions so long as your license otherwise remains
in force.  You may convey covered works to others for the sole purpose
of having them make modifications exclusively for you, or provide you
with facilities for running those works, provided that you comply with
the terms of this License in conveying all material for which you do
not control copyright.  Those thus making or running the covered works
for you must do so exclusively on your behalf, under your direction
and control, on terms that prohibit them from making any copies of
your copyrighted material outside their relationship with you.

  Conveying under any other circumstances is permitted solely under
the conditions stated below.  Sublicensing is not allowed; section 10
makes it unnecessary.

  3. Protecting Users' Legal Rights From Anti-Circumvention Law.

  No covered work shall be deemed part of an effective technological
measure under any applicable law fulfilling obligations under article
11 of the WIPO copyright treaty adopted on 20 December 1996, or
similar laws prohibiting or restricting circumvention of such
measures.

  When you convey a covered work, you waive any legal power to forbid
circumvention of technological measures to the extent such circumvention
is effected by exercising rights under this License with respect to
the covered work, and you disclaim any intention to limit operation or
modification of the work as a means of enforcing, against the work's
users, your or third parties' legal rights to forbid circumvention of
technological measures.

  4. Conveying Verbatim Copies.

  You may convey verbatim copies of the Program's source code as you
receive it, in any medium, provided that you conspicuously and
appropriately publish on each copy an appropriate copyright notice;
keep intact all notices stating that this License and any
non-permissive terms added in accord with section 7 apply to the code;
keep intact all notices of the absence of any warranty; and give all
recipients a copy of this License along with the Program.

  You may charge any price or no price for each copy that you convey,
and you may offer support or warranty protection for a fee.

  5. Conveying Modified Source Versions.

  You may convey a work based on the Program, or the modifications to
produce it from the Program, in the form of source code under the
terms of section 4, provided that you also meet all of these conditions:

    a) The work must carry prominent notices stating that you modified
    it, and giving a relevant date.

    b) The work must carry prominent notices stating that it is
    released under this License and any conditions added under section
    7.  This requirement modifies the requirement in section 4 to
    "keep intact all notices".

    c) You must license the entire work, as a whole, under this
    License to anyone who comes into possession of a copy.  This
    License will therefore apply, along with any applicable section 7
    additional terms, to the whole of the work, and all its parts,
    regardless of how they are packaged.  This License gives no
    permission to license the work in any other way, but it does not
    invalidate such permission if you have separately received it.

    d) If the work has interactive user interfaces, each must display
    Appropriate Legal Notices; however, if the Program has interactive
    interfaces that do not display Appropriate Legal Notices, your
    work need not make them do so.

  A compilation of a covered work with other separate and independent
works, which are not by their nature extensions of the covered work,
and which are not combined with it such as to form a larger program,
in or on a volume of a storage or distribution medium, is called an
"aggregate" if the compilation and its resulting copyright are not
used to limit the access or legal rights of the compilation's users
beyond what the individual works permit.  Inclusion of a covered work
in an aggregate does not cause this License to apply to the other
parts of the aggregate.

  6. Conveying Non-Source Forms.

  You may convey a covered work in object code form under the terms
of sections 4 and 5, provided that you also convey the
machine-readable Corresponding Source under the terms of this License,
in one of these ways:

    a) Convey the object code in, or embodied in, a physical product
    (including a physical distribution medium), accompanied by the
    Corresponding Source fixed on a durable physical medium
    customarily used for software interchange.

    b) Convey the object code in, or embodied in, a physical product
    (including a physical distribution medium), accompanied by a
    written offer, valid for at least three years and valid for as
    long as you offer spare parts or customer support for that product
    model, to give anyone who possesses the object code either (1) a
    copy of the Corresponding Source for all the software in the
    product that is covered by this License, on a durable physical
    medium customarily used for software interchange, for a price no
    more than your reasonable cost of physically performing this
    conveying of source, or (2) access to copy the
    Corresponding Source from a network server at no charge.

    c) Convey individual copies of the object code with a copy of the
    written offer to provide the Corresponding Source.  This
    alternative is allowed only occasionally and noncommercially, and
    only if you received the object code with such an offer, in accord
    with subsection 6b.

    d) Convey the object code by offering access from a designated
    place (gratis or for a charge), and offer equivalent access to the
    Corresponding Source in the same way through the same place at no
    further charge.  You need not require recipients to copy the
    Corresponding Source along with the object code.  If the place to
    copy the object code is a network server, the Corresponding Source
    may be on a different server (operated by you or a third party)
    that supports equivalent copying facilities, provided you maintain
    clear directions next to the object code saying where to find the
    Corresponding Source.  Regardless of what server hosts the
    Corresponding Source, you remain obligated to ensure that it is
    available for as long as needed to satisfy these requirements.

    e) Convey the object code using peer-to-peer transmission, provided
    you inform other peers where the object code and Corresponding
    Source of the work are being offered to the general public at no
    charge under subsection 6d.

  A separable portion of the object code, whose source code is excluded
from the Corresponding Source as a System Library, need not be
included in conveying the object code work.

  A "User Product" is either (1) a "consumer product", which means any
tangible personal property which is normally used for personal, family,
or household purposes, or (2) anything designed or sold for incorporation
into a dwelling.  In determining whether a product is a consumer product,
doubtful cases shall be resolved in favor of coverage.  For a particular
product received by a particular user, "normally used" refers to a
typical or common use of that class of product, regardless of the status
of the particular user or of the way in which the particular user
actually uses, or expects or is expected to use, the product.  A product
is a consumer product regardless of whether the product has substantial
commercial, industrial or non-consumer uses, unless such uses represent
the only significant mode of use of the product.

  "Installation Information" for a User Product means any methods,
procedures, authorization keys, or other information required to install
and execute modified versions of a covered work in that User Product from
a modified version of its Corresponding Source.  The information must
suffice to ensure that the continued functioning of the modified object
code is in no case prevented or interfered with solely because
modification has been made.

  If you convey an object code work under this section in, or with, or
specifically for use in, a User Product, and the conveying occurs as
part of a transaction in which the right of possession and use of the
User Product is transferred to the recipient in perpetuity or for a
fixed term (regardless of how the transaction is characterized), the
Corresponding Source conveyed under this section must be accompanied
by the Installation Information.  But this requirement does not apply
if neither you nor any third party retains the ability to install
modified object code on the User Product (for example, the work has
been installed in ROM).

  The requirement to provide Installation Information does not include a
requirement to continue to provide support service, warranty, or updates
for a work that has been modified or installed by the recipient, or for
the User Product in which it has been modified or installed.  Access to a
network may be denied when the modification itself materially and
adversely affects the operation of the network or violates the rules and
protocols for communication across the network.

  Corresponding Source conveyed, and Installation Information provided,
in accord with this section must be in a format that is publicly
documented (and with an implementation available to the public in
source code form), and must require no special password or key for
unpacking, reading or copying.

  7. Additional Terms.

  "Additional permissions" are terms that supplement the terms of this
License by making exceptions from one or more of its conditions.
Additional permissions that are applicable to the entire Program shall
be treated as though they were included in this License, to the extent
that they are valid under applicable law.  If additional permissions
apply only to part of the Program, that part may be used separately
under those permissions, but the entire Program remains governed by
this License without regard to the additional permissions.

  When you convey a copy of a covered work, you may at your option
remove any additional permissions from that copy, or from any part of
it.  (Additional permissions may be written to require their own
removal in certain cases when you modify the work.)  You may place
additional permissions on material, added by you to a covered work,
for which you have or can give appropriate copyright permission.

  Notwithstanding any other provision of this License, for material you
add to a covered work, you may (if authorized by the copyright holders of
that material) supplement the terms of this License with terms:

    a) Disclaiming warranty or limiting liability differently from the
    terms of sections 15 and 16 of this License; or

    b) Requiring preservation of specified reasonable legal notices or
    author attributions in that material or in the Appropriate Legal
    Notices displayed by works containing it; or

    c) Prohibiting misrepresentation of the origin of that material, or
    requiring that modified versions of such material be marked in
    reasonable ways as different from the original version; or

    d) Limiting the use for publicity purposes of names of licensors or
    authors of the material; or

    e) Declining to grant rights under trademark law for use of some
    trade names, trademarks, or service marks; or

    f) Requiring indemnification of licensors and authors of that
    material by anyone who conveys the material (or modified versions of
    it) with contractual assumptions of liability to the recipient, for
    any liability that these contractual assumptions directly impose on
    those licensors and authors.

  All other non-permissive additional terms are considered "further
restrictions" within the meaning of section 10.  If the Program as you
received it, or any part of it, contains a notice stating that it is
governed by this License along with a term that is a further
restriction, you may remove that term.  If a license document contains
a further restriction but permits relicensing or conveying under this
License, you may add to a covered work material governed by the terms
of that license document, provided that the further restriction does
not survive such relicensing or conveying.

  If you add terms to a covered work in accord with this section, you
must place, in the relevant source files, a statement of the
additional terms that apply to those files, or a notice indicating
where to find the applicable terms.

  Additional terms, permissive or non-permissive, may be stated in the
form of a separately written license, or stated as exceptions;
the above requirements apply either way.

  8. Termination.

  You may not propagate or modify a covered work except as expressly
provided under this License.  Any attempt otherwise to propagate or
modify it is void, and will automatically terminate your rights under
this License (including any patent licenses granted under the third
paragraph of section 11).

  However, if you cease all violation of this License, then your
license from a particular copyright holder is reinstated (a)
provisionally, unless and until the copyright holder explicitly and
finally terminates your license, and (b) permanently, if the copyright
holder fails to notify you of the violation by some reasonable means
prior to 60 days after the cessation.

  Moreover, your license from a particular copyright holder is
reinstated permanently if the copyright holder notifies you of the
violation by some reasonable means, this is the first time you have
received notice of violation of this License (for any work) from that
copyright holder, and you cure the violation prior to 30 days after
your receipt of the notice.

  Termination of your rights under this section does not terminate the
licenses of parties who have received copies or rights from you under
this License.  If your rights have been terminated and not permanently
reinstated, you do not qualify to receive new licenses for the same
material under section 10.

  9. Acceptance Not Required for Having Copies.

  You are not required to accept this License in order to receive or
run a copy of the Program.  Ancillary propagation of a covered work
occurring solely as a consequence of using peer-to-peer transmission
to receive a copy likewise does not require acceptance.  However,
nothing other than this License grants you permission to propagate or
modify any covered work.  These actions infringe copyright if you do
not accept this License.  Therefore, by modifying or propagating a
covered work, you indicate your acceptance of this License to do so.

  10. Automatic Licensing of Downstream Recipients.

  Each time you convey a covered work, the recipient automatically
receives a license from the original licensors, to run, modify and
propagate that work, subject to this License.  You are not responsible
for enforcing compliance by third parties with this License.

  An "entity transaction" is a transaction transferring control of an
organization, or substantially all assets of one, or subdividing an
organization, or merging organizations.  If propagation of a covered
work results from an entity transaction, each party to that
transaction who receives a copy of the work also receives whatever
licenses to the work the party's predecessor in interest had or could
give under the previous paragraph, plus a right to possession of the
Corresponding Source of the work from the predecessor in interest, if
the predecessor has it or can get it with reasonable efforts.

  You may not impose any further restrictions on the exercise of the
rights granted or affirmed under this License.  For example, you may
not impose a license fee, royalty, or other charge for exercise of
rights granted under this License, and you may not initiate litigation
(including a cross-claim or counterclaim in a lawsuit) alleging that
any patent claim is infringed by making, using, selling, offering for
sale, or importing the Program or any portion of it.

  11. Patents.

  A "contributor" is a copyright holder who authorizes use under this
License of the Program or a work on which the Program is based.  The
work thus licensed is called the contributor's "contributor version".

  A contributor's "essential patent claims" are all patent claims
owned or controlled by the contributor, whether already acquired or
hereafter acquired, that would be infringed by some manner, permitted
by this License, of making, using, or selling its contributor version,
but do not include claims that would be infringed only as a
consequence of further modification of the contributor version.  For
purposes of this definition, "control" includes the right to grant
patent sublicenses in a manner consistent with the requirements of
this License.

  Each contributor grants you a non-exclusive, worldwide, royalty-free
patent license under the contributor's essential patent claims, to
make, use, sell, offer for sale, import and otherwise run, modify and
propagate the contents of its contributor version.

  In the following three paragraphs, a "patent license" is any express
agreement or commitment, however denominated, not to enforce a patent
(such as an express permission to practice a patent or covenant not to
sue for patent infringement).  To "grant" such a patent license to a
party means to make such an agreement or commitment not to enforce a
patent against the party.

  If you convey a covered work, knowingly relying on a patent license,
and the Corresponding Source of the work is not available for anyone
to copy, free of charge and under the terms of this License, through a
publicly available network server or other readily accessible means,
then you must either (1) cause the Corresponding Source to be so
available, or (2) arrange to deprive yourself of the benefit of the
patent license for this particular work, or (3) arrange, in a manner
consistent with the requirements of this License, to extend the patent
license to downstream recipients.  "Knowingly relying" means you have
actual knowledge that, but for the patent license, your conveying the
covered work in a country, or your recipient's use of the covered work
in a country, would infringe one or more identifiable patents in that
country that you have reason to believe are valid.

  If, pursuant to or in connection with a single transaction or
arrangement, you convey, or propagate by procuring conveyance of, a
covered work, and grant a patent license to some of the parties
receiving the covered work authorizing them to use, propagate, modify
or convey a specific copy of the covered work, then the patent license
you grant is automatically extended to all recipients of the covered
work and works based on it.

  A patent license is "discriminatory" if it does not include within
the scope of its coverage, prohibits the exercise of, or is
conditioned on the non-exercise of one or more of the rights that are
specifically granted under this License.  You may not convey a covered
work if you are a party to an arrangement with a third party that is
in the business of distributing software, under which you make payment
to the third party based on the extent of your activity of conveying
the work, and under which the third party grants, to any of the
parties who would receive the covered work from you, a discriminatory
patent license (a) in connection with copies of the covered work
conveyed by you (or copies made from those copies), or (b) primarily
for and in connection with specific products or compilations that
contain the covered work, unless you entered into that arrangement,
or that patent license was granted, prior to 28 March 2007.

  Nothing in this License shall be construed as excluding or limiting
any implied license or other defenses to infringement that may
otherwise be available to you under applicable patent law.

  12. No Surrender of Others' Freedom.

  If conditions are imposed on you (whether by court order, agreement or
otherwise) that contradict the conditions of this License, they do not
excuse you from the conditions of this License.  If you cannot convey a
covered work so as to satisfy simultaneously your obligations under this
License and any other pertinent obligations, then as a consequence you may
not convey it at all.  For example, if you agree to terms that obligate you
to collect a royalty for further conveying from those to whom you convey
the Program, the only way you could satisfy both those terms and this
License would be to refrain entirely from conveying the Program.

  13. Remote Network Interaction; Use with the GNU General Public License.

  Notwithstanding any other provision of this License, if you modify the
Program, your modified version must prominently offer all users
interacting with it remotely through a computer network (if your version
supports such interaction) an opportunity to receive the Corresponding
Source of your version by providing access to the Corresponding Source
from a network server at no charge, through some standard or customary
means of facilitating copying of software.  This Corresponding Source
shall include the Corresponding Source for any work covered by version 3
of the GNU General Public License that is incorporated pursuant to the
following paragraph.

  Notwithstanding any other provision of this License, you have
permission to link or combine any covered work with a work licensed
under version 3 of the GNU General Public License into a single
combined work, and to convey the resulting work.  The terms of this
License will continue to apply to the part which is the covered work,
but the work with which it is combined will remain governed by version
3 of the GNU General Public License.

  14. Revised Versions of this License.

  The Free Software Foundation may publish revised and/or new versions of
the GNU Affero General Public License from time to time.  Such new versions
will be similar in spirit to the present version, but may differ in detail to
address new problems or concerns.

  Each version is given a distinguishing version number.  If the
Program specifies that a certain numbered version of the GNU Affero General
Public License "or any later version" applies to it, you have the
option of following the terms and conditions either of that numbered
version or of any later version published by the Free Software
Foundation.  If the Program does not specify a version number of the
GNU Affero General Public License, you may choose any version ever published
by the Free Software Foundation.

  If the Program specifies that a proxy can decide which future
versions of the GNU Affero General Public License can be used, that proxy's
public statement of acceptance of a version permanently authorizes you
to choose that version for the Program.

  Later license versions may give you additional or different
permissions.  However, no additional obligations are imposed on any
author or copyright holder as a result of your choosing to follow a
later version.

  15. Disclaimer of Warranty.

  THERE IS NO WARRANTY FOR THE PROGRAM, TO THE EXTENT PERMITTED BY
APPLICABLE LAW.  EXCEPT WHEN OTHERWISE STATED IN WRITING THE COPYRIGHT
HOLDERS AND/OR OTHER PARTIES PROVIDE THE PROGRAM "AS IS" WITHOUT WARRANTY
OF ANY KIND, EITHER EXPRESSED OR IMPLIED, INCLUDING, BUT NOT LIMITED TO,
THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
PURPOSE.  THE ENTIRE RISK AS TO THE QUALITY AND PERFORMANCE OF THE PROGRAM
IS WITH YOU.  SHOULD THE PROGRAM PROVE DEFECTIVE, YOU ASSUME THE COST OF
ALL NECESSARY SERVICING, REPAIR OR CORRECTION.

  16. Limitation of Liability.

  IN NO EVENT UNLESS REQUIRED BY APPLICABLE LAW OR AGREED TO IN WRITING
WILL ANY COPYRIGHT HOLDER, OR ANY OTHER PARTY WHO MODIFIES AND/OR CONVEYS
THE PROGRAM AS PERMITTED ABOVE, BE LIABLE TO YOU FOR DAMAGES, INCLUDING ANY
GENERAL, SPECIAL, INCIDENTAL OR CONSEQUENTIAL DAMAGES ARISING OUT OF THE
USE OR INABILITY TO USE THE PROGRAM (INCLUDING BUT NOT LIMITED TO LOSS OF
DATA OR DATA BEING RENDERED INACCURATE OR LOSSES SUSTAINED BY YOU OR THIRD
PARTIES OR A FAILURE OF THE PROGRAM TO OPERATE WITH ANY OTHER PROGRAMS),
EVEN IF SUCH HOLDER OR OTHER PARTY HAS BEEN ADVISED OF THE POSSIBILITY OF
SUCH DAMAGES.

  17. Interpretation of Sections 15 and 16.

  If the disclaimer of warranty and limitation of liability provided
above cannot be given local legal effect according to their terms,
reviewing courts shall apply local law that most closely approximates
an absolute waiver of all civil liability in connection with the
Program, unless a warranty or assumption of liability accompanies a
copy of the Program in return for a fee.

                     END OF TERMS AND CONDITIONS

            How to Apply These Terms to Your New Programs

  If you develop a new program, and you want it to be of the greatest
possible use to the public, the best way to achieve this is to make it
free software which everyone can redistribute and change under these terms.

  To do so, attach the following notices to the program.  It is safest
to attach them to the start of each source file to most effectively
state the exclusion of warranty; and each file should have at least
the "copyright" line and a pointer to where the full notice is found.

    <one line to give the program's name and a brief idea of what it does.>
    Copyright (C) <year>  <name of author>

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.

Also add information on how to contact you by electronic and paper mail.

  If your software can interact with users remotely through a computer
network, you should also make sure that it provides a way for users to
get its source.  For example, if your program is a web application, its
interface could display a "Source" link that leads users to an archive
of the code.  There are many ways you could offer source, and different
solutions will be better for different programs; see section 13 for the
specific requirements.

  You should also get your employer (if you work as a programmer) or school,
if any, to sign a "copyright disclaimer" for the program, if necessary.
For more information on this, and how to apply and follow the GNU AGPL, see
<https://www.gnu.org/licenses/>.
```

---

開始執行。