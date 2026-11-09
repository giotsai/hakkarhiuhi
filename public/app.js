const $ = id => document.getElementById(id);
const questionCount = 6;
let index = 0, currentQuestion, recorder, chunks = [], stream, completed = 0, audioUrl;

async function loadQuestions() {
  const response = await fetch(`/api/questions/${index + 1}`);
  const question = await response.json();
  if (!response.ok) throw new Error(question.error || '題目載入失敗。');
  currentQuestion = question;
  showQuestion();
}
function showQuestion() {
  const q = currentQuestion;
  $('prompt').textContent = q.text; $('meaning').textContent = q.meaning;
  $('level').textContent = q.level; $('count').textContent = `第 ${index + 1} 題`;
  $('progress').style.width = `${((index + 1) / questionCount) * 100}%`;
  $('result').classList.add('hidden'); $('status').classList.remove('error');
  $('status').textContent = '先聽示範，再按下開始錄音。'; $('rounds').textContent = `已完成 ${completed} 題`;
}
function setStatus(message, error = false) { $('status').textContent = message; $('status').classList.toggle('error', error); }

$('listen').addEventListener('click', async () => {
  $('listen').disabled = true; setStatus('正在準備大埔腔發音…');
  try {
    const response = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: currentQuestion.text }) });
    if (!response.ok) throw new Error((await response.json()).error || '語音合成失敗。');
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioUrl = URL.createObjectURL(await response.blob());
    const audio = new Audio(audioUrl); await audio.play(); setStatus('仔細聽，準備跟著講。');
  } catch (e) { setStatus(e.message || '目前無法播放語音。', true); }
  finally { $('listen').disabled = false; }
});

$('record').addEventListener('click', async () => {
  if (recorder?.state === 'recording') { recorder.stop(); return; }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks = []; recorder = new MediaRecorder(stream); recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = submitRecording; recorder.start();
    $('record').classList.add('recording'); $('record').innerHTML = '<span class="button-icon">■</span>停止錄音'; setStatus('正在錄音，講完請按停止。');
  } catch { setStatus('無法使用麥克風，請確認已允許瀏覽器存取麥克風。', true); }
});

async function submitRecording() {
  stream?.getTracks().forEach(track => track.stop());
  $('record').classList.remove('recording'); $('record').innerHTML = '<span class="button-icon">●</span>開始錄音';
  const audio = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
  if (audio.size < 1000) { setStatus('錄音太短，請再試一次。', true); return; }
  const form = new FormData(); form.append('audio', audio, 'answer.webm'); form.append('expected', currentQuestion.text);
  $('record').disabled = true; setStatus('正在辨識你的發音…');
  try {
    const response = await fetch('/api/asr', { method: 'POST', body: form });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || '辨識失敗。');
    $('score').innerHTML = `${result.score}<small>分</small>`; $('transcript').textContent = `你講的是：「${result.transcript}」`;
    $('feedback').textContent = result.score >= 90 ? '講得真準！' : result.score >= 65 ? '講得不錯，再練一擺！' : '再聽一次，慢慢講就好。';
    $('expected').textContent = result.expected; $('result').classList.remove('hidden'); completed++; $('rounds').textContent = `已完成 ${completed} 題`;
    setStatus('辨識完成。這個分數依文字相似度計算，適合當作練習參考。');
  } catch (e) { setStatus(e.message || '語音辨識發生問題。', true); }
  finally { $('record').disabled = false; }
}

$('next').addEventListener('click', async () => {
  index = (index + 1) % questionCount; $('next').disabled = true; $('listen').disabled = true;
  $('record').disabled = true; setStatus('正在用 Gohakka 翻譯準備下一題…');
  try { await loadQuestions(); }
  catch (e) { setStatus(e.message || '題目載入失敗，請稍後再試。', true); }
  finally { $('next').disabled = false; $('listen').disabled = false; $('record').disabled = false; }
});
loadQuestions().catch(e => setStatus(e.message || '題目載入失敗，請重新整理頁面。', true));
