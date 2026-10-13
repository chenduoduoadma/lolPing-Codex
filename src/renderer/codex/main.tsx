import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { CodexApi, CodexState } from '../../shared/codex';
import { ALL_PINGS, type PingId } from '../../shared/pings';
import './style.css';
declare global { interface Window { codexApi: CodexApi } }
const api = window.codexApi;
const labels: Record<PingId, string> = { danger: '危险', push: '推进', omw: '正在路上', allin: '全力进攻', assist: '请求协助', needvision: '需要视野', missing: '敌人消失', enemyvision: '敌方视野', generic: '普通信号', bait: '诱饵', visioncleared: '视野已清除' };
function App() {
  const [state, setState] = useState<CodexState | null>(null);
  const [question, setQuestion] = useState('');
  const [allowChanges, setAllowChanges] = useState(false);
  const [attach, setAttach] = useState(true);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const busy = pending || state?.phase === 'running';
  const action = async (fn: () => Promise<unknown>) => {
    setError(''); setPending(true);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : String(e)); }
    finally { setPending(false); }
  };
  useEffect(() => { void api.state().then(setState).catch((e) => setError(String(e))); return api.onState(setState); }, []);
  if (!state) return <p className="loading">{error || '正在连接…'}</p>;
  return <>
    <header><span className="eyebrow">LOLPING × CODEX</span><h1>有问题，发个信号。</h1><p>描述你需要的帮助，确认后交给 Codex。</p></header>
    <section className="trigger"><label><input type="checkbox" checked={state.preferences.enabled} onChange={(e) => void action(() => api.preferences({ enabled: e.target.checked, trigger: state.preferences.trigger }))}/> 启用信号唤起</label><select aria-label="触发信号" value={state.preferences.trigger} onChange={(e) => void action(() => api.preferences({ enabled: state.preferences.enabled, trigger: e.target.value as PingId }))}>{ALL_PINGS.map((p) => <option key={p.id} value={p.id}>{labels[p.id]}</option>)}</select></section>
    <form onSubmit={(e) => { e.preventDefault(); void action(() => api.submit({ question, allowChanges, attachScreenshot: attach && !!state.screenshot })); }}>
      <label className="caption" htmlFor="question">需要我解决什么？</label><textarea autoFocus id="question" maxLength={20000} value={question} onChange={(e) => setQuestion(e.target.value)} disabled={busy} placeholder="例如：屏幕上这个报错是什么原因？帮我检查并给出修复办法。"/>
      <div className="workspace"><div><span className="caption">工作文件夹</span><code>{state.preferences.workspace}</code></div><button type="button" disabled={busy} onClick={() => void action(() => api.chooseWorkspace())}>选择文件夹</button></div>
      <div className="workspace"><div><span className="caption">Codex 程序</span><code>{state.preferences.codexPath || '自动查找本机 Codex'}</code></div><button type="button" disabled={busy} onClick={() => void action(() => api.chooseCodex())}>选择 Codex 程序</button></div>
      <div className="workspace"><div><span className="caption">截图屏幕</span><span className="caption">发信号自动切换，也可手动选择</span></div><select aria-label="截图屏幕" disabled={busy} value={state.captureDisplayId ?? ''} onChange={(e) => void action(() => api.selectDisplay(Number(e.target.value)))}>{state.displays.map((d) => <option key={d.id} value={d.id}>屏幕 {d.number}{d.primary ? '（主屏）' : ''} · {d.width} × {d.height} · {Math.round(d.scale * 100)}%{d.label ? ` · ${d.label}` : ''}</option>)}</select></div>
      <div className="tools"><button type="button" disabled={busy} onClick={() => void action(async () => { await api.captureRegion(); setAttach(true); })}>框选截图区域</button><button type="button" disabled={busy} onClick={() => void action(async () => { await api.capture(); setAttach(true); })}>截取整块屏幕</button>{state.screenshot && <><label><input type="checkbox" disabled={busy} checked={attach} onChange={(e) => setAttach(e.target.checked)}/> 附上截图</label><button type="button" disabled={busy} onClick={() => void action(() => api.clearCapture())}>移除截图</button></>}</div>
      {state.screenshot && <img className="screenshot" src={state.screenshot} alt="待提交的屏幕截图"/>}
      <label className="permission"><input type="checkbox" disabled={busy} checked={allowChanges} onChange={(e) => setAllowChanges(e.target.checked)}/> 允许 Codex 修改所选工作文件夹中的文件</label>
      <div className="submit"><span>默认只分析。截图经你确认提交后发送。</span><button className="primary" disabled={busy || !question.trim()} type="submit">{busy ? '正在处理…' : '确认并交给 Codex'}</button></div>
    </form>
    {error && <p className="error" role="alert">{error}</p>}
    <section className="answer" aria-live="polite"><div className="answerhead"><span className={`status ${state.phase}`}>{state.message}</span>{state.phase === 'running' && <button onClick={() => void action(() => api.cancel())}>停止任务</button>}{state.threadId && <button onClick={() => void action(() => api.openThread())}>在 Codex 中打开</button>}</div>{state.reply && <pre>{state.reply}</pre>}</section>
    <footer>使用本机已有的 Codex 登录与额度。提交的截图保存在 lolPing 的用户数据文件夹。</footer>
  </>;
}
createRoot(document.getElementById('root')!).render(<App/>);
