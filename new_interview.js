// ============ 新版面试：摄像头 + 语音 ============

// 检测语音识别支持
useEffect(() => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  setSpeechSupported(!!SpeechRecognition);
}, []);

// 视频流绑定
useEffect(() => {
  if (videoRef.current && videoStream) {
    videoRef.current.srcObject = videoStream;
    videoRef.current.play().catch(() => {});
  }
}, [videoStream]);

// 开启摄像头
const startCamera = useCallback(async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    streamRef.current = stream;
    setVideoStream(stream);
    setVideoEnabled(true);
  } catch (err) { setVideoEnabled(false); }
}, []);

// 停止摄像头
const stopCamera = useCallback(() => {
  stopSpeech();
  if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
  setVideoStream(null); setVideoEnabled(false);
}, []);

// 停止语音
const stopSpeech = useCallback(() => {
  if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch {} recognitionRef.current = null; }
  isRecordingRef.current = false; setIsRecording(false);
}, []);

// 开始语音识别
const startSpeechRecognition = useCallback(() => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;
  if (recognitionRef.current) return;
  const r = new SR(); r.lang = 'zh-CN'; r.interimResults = true; r.continuous = true;
  r.onresult = (e) => { let t=''; for(let i=e.resultIndex;i<e.results.length;i++) t+=e.results[i][0].transcript; setSpeechText(t); setIvAnswer(t); };
  r.onend = () => { if(isRecordingRef.current&&recognitionRef.current===r) try{r.start()}catch{} else{recognitionRef.current=null;setIsRecording(false)} };
  recognitionRef.current = r; isRecordingRef.current = true; setIsRecording(true);
  try { r.start(); } catch { recognitionRef.current = null; isRecordingRef.current = false; setIsRecording(false); }
}, []);

// ============ 面试流程控制 ============

// 1. 选择模式，生成8题
const handleSelectMode = async (mode) => {
  setIvMode(mode); setIvStep('loading'); setIvQuestions([]); setIvQIndex(0); setIvScores([]);
  setIvFeedback(null); setIvAnswer(''); setSpeechText(''); setIsRecording(false); stopSpeech();
  if (mode === 'video') { await startCamera(); }
  try {
    const qs = await generate8Questions(fullProfile, resumeText, jd);
    const valid = Array.isArray(qs) && qs.length >= 8 ? qs : [
      '请做一下自我介绍，重点介绍与岗位相关的背景。','请详细介绍你最有代表性的一个项目或实习经历。','在这个项目中，你遇到了什么挑战？你是如何解决的？',
      '你认为自己应聘这个岗位最大的优势是什么？','请举例说明你如何与团队协作完成一个任务。','如果工作中遇到和领导意见不一致的情况，你会怎么处理？',
      '你对未来3-5年的职业规划是什么？','你对我们公司或这个岗位有什么想了解的？'];
    setIvQuestions(valid.slice(0,8)); setIvCurrentQ(valid[0]); setIvStep('ready');
  } catch (err) { setIvQuestions(['请做一下自我介绍。']); setIvCurrentQ('请做一下自我介绍。'); setIvStep('ready'); }
};

// 2. 准备完成，开始答题
const handleReady = () => { setIvStep('answering'); setIvAnswer(''); setSpeechText(''); };

// 3. 回答结束，AI评分
const handleEndAnswer = async () => {
  stopSpeech(); setIsRecording(false);
  setIvStep('scoring'); setIvFeedback(null);
  try {
    const exprData = ivMode === 'video' ? expressionRef.current : null;
    const result = await scoreAnswer(ivMode, ivCurrentQ, ivAnswer || '（摄像头口头回答）', exprData);
    result.passed = (result.score || 0) >= 95;
    setIvFeedback(result);
    const newScores = [...ivScores, { q: ivCurrentQ, a: ivAnswer, ...result }];
    setIvScores(newScores);
    if (result.passed && ivQIndex >= 7) { setIvStep('summary'); } // 8题全过
  } catch (err) { setIvFeedback({ score: 70, passed: false, feedback: '评分出错：'+err.message }); }
};

// 4. 下一题 或 重试
const handleNextQ = () => {
  const nextIdx = ivQIndex + 1;
  setIvQIndex(nextIdx); setIvCurrentQ(ivQuestions[nextIdx]);
  setIvAnswer(''); setSpeechText(''); setIvFeedback(null); setIvStep('ready');
};

const handleRetry = () => {
  setIvAnswer(''); setSpeechText(''); setIvFeedback(null); setIvStep('ready');
};

// 5. 生成总结
const handleSummary = async () => {
  setIvStep('loading');
  try {
    const config = { apiKey: localStorage.getItem('ai_api_key')||'sk-6b45cfc11a954fc08183e0a86679977a', baseUrl: localStorage.getItem('ai_base_url')||'https://api.deepseek.com/v1', model: localStorage.getItem('ai_model')||'deepseek-chat' };
    const avg = Math.round(ivScores.reduce((a,b)=>a+(b.score||0),0)/ivScores.length);
    const msg = `面试完成。共${ivScores.length}题通过，均分${avg}。请生成面试总结报告。`;
    const summary = await scoreAnswer(ivMode, '总结', msg, null);
    setIvSummary(summary?.feedback || `面试完成！均分${avg}分，共通过${ivScores.length}/8题。`);
  } catch { setIvSummary('面试总结生成中...'); }
  setIvStep('summary');
};
