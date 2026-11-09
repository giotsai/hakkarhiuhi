import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const here = path.dirname(fileURLToPath(import.meta.url));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(here, 'public')));

const prompts = [
  { meaning: '吃飯要好好吃，才不會吃得半生不熟。', level: '初級' },
  { meaning: '客家山城也漸漸熱鬧起來了。', level: '初級' },
  { meaning: '事情最好是像你說的那樣。', level: '中級' },
  { meaning: '你趕快去做，不要拖延。', level: '初級' },
  { meaning: '從前的人，住的不是茅草屋。', level: '中級' },
  { meaning: '放暑假的時候，阿松全家回家去。', level: '中級' }
];

function apiConfig() {
  const base = (process.env.GOHAKKA_API_BASE || 'https://api.gohakka.org').replace(/\/$/, '');
  const token = process.env.GOHAKKA_API_TOKEN;
  if (!token) {
    const err = new Error('服務尚未設定 Gohakka API。請管理者在 Render 設定 API 網址、金鑰與 TTS/ASR 路徑。');
    err.status = 503;
    throw err;
  }
  return { base, token };
}

async function gohakka(pathname, options) {
  const { base, token } = apiConfig();
  const response = await fetch(`${base}${pathname.startsWith('/') ? pathname : `/${pathname}`}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers }
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw Object.assign(new Error(`Gohakka API 回應 ${response.status}${detail ? `：${detail}` : ''}`), { status: 502 });
  }
  return response;
}

app.get('/api/health', (_req, res) => res.json({ ok: true, configured: Boolean(process.env.GOHAKKA_API_TOKEN) }));
app.get('/api/questions/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const prompt = prompts[id - 1];
    if (!prompt) return res.status(404).json({ error: '題目不存在。' });
    const form = new FormData();
    form.append('text', prompt.meaning);
    form.append('dialectCode', 'dapu');
    form.append('targetCode', 'hak');
    form.append('engine', 'model');
    const response = await gohakka('/v3/pro/text/translations', { method: 'POST', body: form });
    const payload = await response.json();
    if (!payload.success || !payload.data) throw Object.assign(new Error(payload.error?.message || '客語翻譯服務目前無法出題。'), { status: 502 });
    const translations = payload.data.hak;
    const text = Array.isArray(translations) ? (translations.length === 1 ? translations[0] : translations.join('')) : translations;
    if (typeof text !== 'string' || !text.trim()) throw Object.assign(new Error('客語翻譯服務沒有回傳題目文字。'), { status: 502 });
    res.json({ id, text: text.trim(), meaning: prompt.meaning, level: prompt.level });
  } catch (e) { next(e); }
});

app.post('/api/tts', async (req, res, next) => {
  try {
    const text = String(req.body?.text || '').trim();
    if (!text || text.length > 300) return res.status(400).json({ error: '請提供有效的題目文字。' });
    const form = new FormData();
    form.append('text', text);
    form.append('dialectCode', 'dapu');
    form.append('sourceCode', 'hak');
    const response = await gohakka('/v3/pro/audio/speech', { method: 'POST', body: form });
    const payload = await response.json();
    if (!payload.success || !payload.data?.audioBase64) throw Object.assign(new Error(payload.error?.message || '語音合成服務沒有回傳音訊。'), { status: 502 });
    const audio = Buffer.from(payload.data.audioBase64, 'base64');
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.send(audio);
  } catch (e) { next(e); }
});

app.post('/api/asr', upload.single('audio'), async (req, res, next) => {
  try {
    const expected = String(req.body?.expected || '').trim();
    if (!expected || !req.file) return res.status(400).json({ error: '請選擇題目並錄製回答。' });
    const form = new FormData();
    form.append('audioFile', new Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname || 'answer.webm');
    form.append('dialectCode', 'dapu');
    const response = await gohakka('/v3/pro/audio/transcriptions', { method: 'POST', body: form });
    const payload = await response.json();
    if (!payload.success) throw Object.assign(new Error(payload.error?.message || '語音辨識服務目前無法辨識。'), { status: 502 });
    const transcript = payload.data?.text ?? '';
    if (typeof transcript !== 'string' || !transcript.trim()) throw Object.assign(new Error('辨識服務沒有回傳可用文字。'), { status: 502 });
    res.json({ transcript, score: scoreText(expected, transcript), expected });
  } catch (e) { next(e); }
});

function normalize(s) { return [...s.normalize('NFC').replace(/[\s，。！？、；：,.!?;:'"「」『』（）()\-]/g, '')]; }
function scoreText(expected, actual) {
  const a = normalize(expected), b = normalize(actual);
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return Math.round(Math.max(0, 1 - row[b.length] / Math.max(1, a.length)) * 100);
}

app.use((err, _req, res, _next) => {
  console.error(err.message);
  res.status(err.status || 500).json({ error: err.status === 503 || err.status === 502 ? err.message : '伺服器發生錯誤，請稍後再試。' });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, '0.0.0.0', () => console.log(`Hakka quiz listening on ${port}`));
