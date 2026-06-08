  const renderInterview = () => {
    // 选择页
    if (ivStep === 'select') return (
      <div className="iv-select-page">
        <h2>🎯 选择面试模式</h2>
        <p className="iv-select-desc">请选择适合你的面试方式</p>
        <div className="iv-select-cards">
          <div className="iv-card iv-card-video" onClick={() => handleSelectMode('video')}>
            <div className="iv-card-icon">🎥</div>
            <h3>视频面试</h3>
            <p>开启摄像头和麦克风，AI根据回答内容+表情状态综合评分</p>
            <ul><li>📷 实时面部表情分析</li><li>🎤 语音识别转文字</li><li>📊 双维度评分（内容+表现）</li><li>🎯 95分通过，8题全部通过即合格</li></ul>
          </div>
          <div className="iv-card iv-card-text" onClick={() => handleSelectMode('text')}>
            <div className="iv-card-icon">💬</div>
            <h3>无视频面试</h3>
            <p>纯文字作答，AI根据回答内容的专业性评分</p>
            <ul><li>⌨️ 文字输入回答</li><li>🎤 可选语音输入</li><li>📊 内容专业性评分</li><li>🎯 95分通过，8题全部通过即合格</li></ul>
          </div>
        </div>
      </div>
    );

    // 加载中
    if (ivStep === 'loading') return (
      <div className="iv-loading-page">
        <div className="spinner"></div>
        <p>AI 正在生成面试题目...</p>
      </div>
    );

    // 准备页
    if (ivStep === 'ready') return (
      <div className="iv-ready-page">
        <div className="iv-ready-header">
          <h2>{ivMode === 'video' ? '🎥 视频面试' : '💬 文字面试'}</h2>
          <div className="iv-progress-bar"><div className="iv-progress-fill" style={{width:((ivQIndex)/8*100)+'%'}}></div></div>
          <span className="iv-progress-text">第 {ivQIndex+1}/8 题</span>
        </div>
        <div className="iv-q-card">
          <div className="iv-q-num">Q{ivQIndex+1}</div>
          <p className="iv-q-text">{ivCurrentQ}</p>
        </div>
        {ivMode === 'video' && videoEnabled && (
          <div className="iv-video-preview">
            <video ref={videoRef} autoPlay playsInline muted className="iv-video-feed" />
          </div>
        )}
        <button className="iv-ready-btn" onClick={handleReady}>✅ 准备完成，开始作答</button>
      </div>
    );

    // 答题中
    if (ivStep === 'answering') return (
      <div className="iv-answer-page">
        <div className="iv-answer-header">
          <div className="iv-progress-bar"><div className="iv-progress-fill" style={{width:((ivQIndex)/8*100)+'%'}}></div></div>
          <span className="iv-progress-text">第 {ivQIndex+1}/8 题 · 已通过 {ivScores.filter(s=>s.passed).length} 题</span>
        </div>
        <div className="iv-answer-layout">
          <div className="iv-answer-left">
            {ivMode === 'video' && videoEnabled && (
              <div className="iv-video-big">
                <video ref={videoRef} autoPlay playsInline muted className="iv-video-feed" />
                {isRecording && <div className="iv-rec-dot"></div>}
              </div>
            )}
            <div className="iv-q-mini">
              <span className="iv-q-badge">Q{ivQIndex+1}</span>
              <p>{ivCurrentQ}</p>
            </div>
          </div>
          <div className="iv-answer-right">
            <div className="iv-speech-area">
              <div className="iv-speech-header">
                <span>🎤 语音转文字</span>
                <div className="iv-speech-btns">
                  {!isRecording ? (
                    <button className="iv-mic-btn" onClick={startSpeechRecognition}>🎤 开始录音</button>
                  ) : (
                    <button className="iv-mic-btn iv-mic-on" onClick={stopSpeech}>⏹️ 停止</button>
                  )}
                </div>
              </div>
              <textarea className="iv-answer-input" value={ivAnswer} onChange={e => setIvAnswer(e.target.value)}
                rows={6} placeholder="语音自动转文字显示在这里，也可以直接输入..." disabled={false} />
              {isRecording && <p className="iv-listening-hint">🔴 正在聆听，请对着麦克风回答...</p>}
            </div>
            <button className="iv-end-btn" onClick={handleEndAnswer}>
              {ivMode === 'video' ? '⏹️ 回答结束，提交评分' : '📤 提交回答'}
            </button>
          </div>
        </div>
      </div>
    );

    // 评分反馈
    if (ivStep === 'scoring' && ivFeedback) return (
      <div className="iv-score-page">
        <div className="iv-progress-bar"><div className="iv-progress-fill" style={{width:((ivQIndex+(ivFeedback.passed?1:0))/8*100)+'%'}}></div></div>
        <span className="iv-progress-text">第 {ivQIndex+1}/8 题</span>
        <div className="iv-score-card">
          <div className={`iv-score-circle ${ivFeedback.passed ? 'passed' : 'failed'}`}>
            <span className="iv-score-num">{ivFeedback.score || 0}</span>
            <span className="iv-score-label">分</span>
          </div>
          <div className="iv-score-info">
            <h3>{ivFeedback.passed ? '🎉 通过！' : '📝 未通过，请重试'}</h3>
            <div className="iv-score-detail">{ivFeedback.feedback?.split('\n').map((l,i)=><p key={i}>{l}</p>)}</div>
          </div>
        </div>
        <div className="iv-score-actions">
          {ivFeedback.passed ? (
            <button className="iv-next-btn" onClick={handleNextQ}>▶️ 下一题</button>
          ) : (
            <button className="iv-retry-btn" onClick={handleRetry}>🔄 根据反馈重新作答</button>
          )}
        </div>
      </div>
    );

    // 总结页
    return (
      <div className="iv-summary-page">
        <h2>🎉 面试完成</h2>
        <div className="iv-summary-stats">
          <div className="iv-stat"><span className="iv-stat-num">{ivScores.filter(s=>s.passed).length}</span><span>通过题数/8</span></div>
          <div className="iv-stat"><span className="iv-stat-num">{Math.round(ivScores.reduce((a,b)=>a+(b.score||0),0)/Math.max(ivScores.length,1))}</span><span>平均分</span></div>
        </div>
        <div className="iv-summary-table">
          {ivScores.map((s,i) => (
            <div key={i} className={`iv-summary-row ${s.passed ? 'passed' : 'failed'}`}>
              <span className="iv-sr-num">{s.passed ? '✓' : '✗'} Q{i+1}</span>
              <span className="iv-sr-score">{s.score}分</span>
              <span className="iv-sr-feedback">{s.feedback?.split('\n')[0]?.slice(0,60) || ''}</span>
            </div>
          ))}
        </div>
        <button className="iv-restart-btn" onClick={() => { stopCamera(); setIvStep('select'); setIvMode(''); setIvQuestions([]); setIvQIndex(0); setIvScores([]); }}>
          🔄 重新开始
        </button>
      </div>
    );
  };
