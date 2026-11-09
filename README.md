# 講客｜大埔腔聽講練習

一個可部署在 Render 的大埔腔客語朗讀練習網站。玩家先從中文提示取得 Gohakka 大埔腔翻譯題目，聽 TTS 發音，再錄音送到 ASR，伺服器以辨識文字與題目原文的字元相似度計算練習分數。

## 本機啟動

```sh
npm install
Copy-Item .env.example .env
npm start
```

在 `.env` 設定 Gohakka API 參數後，瀏覽 `http://localhost:3000`。API 金鑰只放伺服器環境變數，不要放到前端或提交至 Git。

## Gohakka API 設定

建立服務時需要填入：

| 環境變數 | 說明 |
| --- | --- |
| `GOHAKKA_API_TOKEN` | API 金鑰 |

API 基址與端點依 Gohakka Pro API v3 規格：`https://api.gohakka.org/v3/pro/text/translations`、`/v3/pro/audio/speech`、`/v3/pro/audio/transcriptions`。使用 Bearer API Key，題目翻譯與 TTS 傳送 `dialectCode=dapu`，ASR 上傳欄位為 `audioFile`，並使用 `data.hak`、`data.audioBase64`、`data.text` 回應。

## 發布至 Render

1. 將此 GitHub 專案連結至 Render，選擇 Blueprint，Render 會讀取 `render.yaml`。
2. 在 Render Web Service 的 Environment 加入新產生的 `GOHAKKA_API_TOKEN`。
3. 部署完成後使用 Render 提供的網址。瀏覽器麥克風需在 HTTPS 網址或 localhost 才能使用。

`/api/health` 可供 Render 健康檢查。錄音上限為 12 MB；本機與伺服器都不會保存錄音檔。
