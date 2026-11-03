# 剩下一公里

第一人稱黑色幽默駕駛射擊遊戲（Three.js）。

## 本機測試
在這個資料夾執行：

    python3 -m http.server 8000

然後用瀏覽器開 http://localhost:8000
（不能直接雙擊 index.html，瀏覽器會擋 JavaScript 模組。）

## 部署到 Netlify
把整個資料夾拖進 https://app.netlify.com/drop 即可，不需要任何建置設定。

## 檔案結構
- index.html：頁面與介面
- css/style.css：漫畫風介面樣式
- js/main.js：遊戲迴圈、射擊、開場與結局過場
- js/traffic.js：排隊車陣、左側車流、插隊 AI
- js/player.js：第一人稱鏡頭、3D 探頭路徑
- js/cockpit.js：GPT 繪製的駕駛座內裝、探頭前景、手拿槍圖層
- js/world.js：國道、交流道、護欄、指示牌、城市遠景
- js/cars.js：程式化汽車模型
- js/characters.js：8+9 壯漢、後車駕駛、彌勒佛、手槍、雷射槍
- js/audio.js：所有音效（Web Audio 即時合成）
- js/input.js、js/ui.js、js/toon.js、js/config.js
- assets/：圖片素材

Three.js 從 jsdelivr CDN 載入（需要網路）。
