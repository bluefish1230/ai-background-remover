# AI 圖片去背工具

一個可部署到 GitHub Pages 或 Zeabur 的線上 AI 去背工具。圖片在瀏覽器端處理，完成後可以下載透明 PNG。

## 線上網址

GitHub Pages 啟用後，網站會在這裡：

```text
https://bluefish1230.github.io/ai-background-remover/
```

## 本機執行

```bash
npm run dev
```

## 部署到 GitHub Pages

這個專案是靜態網站，可以直接把 `index.html`、`styles.css`、`app.js` 推到 GitHub，並在 GitHub Pages 選擇部署分支。

如果要用 GitHub Actions，也可以先執行：

```bash
npm run build
```

這個專案沒有必要的 build step，直接部署根目錄即可。

## 部署到 Zeabur

1. 將專案推到 GitHub。
2. 在 Zeabur 建立新服務並選擇此 GitHub repo。
3. Build Command 可留空，或使用 `npm run build`。
4. Start Command 使用 `npm run start`。

第一次處理圖片時，瀏覽器會下載 AI 模型檔，之後同一台裝置會比較快。

如果 GitHub Pages 第一次打開後自動重新整理一次，這是正常現象；網站會註冊 service worker 來啟用瀏覽器端 AI 模型需要的跨來源隔離。部署時也會把 AI 模型檔放在同一個 GitHub Pages 網站底下，減少第三方 CDN 造成的載入失敗。

## 筆刷修正

AI 去背抓錯主體時，可以用筆刷修正：

1. 先按「開始去背」產生右側透明 PNG。
2. 用「補回」刷原圖中要留下、但被 AI 刪掉的地方。
3. 用「擦除」刷右側結果中多留下的背景。
4. 按「套用修正」更新右側 PNG，再下載。
