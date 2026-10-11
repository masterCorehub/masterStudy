import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../ui/Icon';
import { askWithWebLLM } from '../../services/webllm.js';
import { JOURNAL_ASSISTANT_ACTIONS, journalAssistantSources, buildJournalAssistantRequest } from '../../domain/journalAssistant.js';

export function JournalAssistantPanel({ draft, entries, month, onClose, onAppend, onReplace, onOpen }) {
  const [action, setAction] = useState('reflect');
  const [result, setResult] = useState('');
  const [sources, setSources] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const revision = useRef(0);
  useEffect(() => {
    const closeOnEscape = event => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  useEffect(() => {
    revision.current += 1; setResult(''); setSources([]); setError('');
    return () => { revision.current += 1; };
  }, [draft.content, draft.entryDate, month]);
  const generate = async chosen => {
    if (busy) return;
    setAction(chosen); setBusy(true); setError(''); setResult('');
    const currentRevision = revision.current;
    try {
      const selected = journalAssistantSources(chosen, draft, entries, month);
      const request = buildJournalAssistantRequest(chosen, selected);
      const desktop = window.studyhubDesktop?.academicAI;
      const answer = desktop?.chat
        ? (await desktop.chat({ messages: [{ role: 'system', content: request.system }, { role: 'user', content: request.prompt }] })).message
        : await askWithWebLLM(request);
      if (!answer?.trim()) throw new Error('A IA não retornou uma resposta. Tente novamente.');
      // Nunca aplique uma resposta antiga a uma entrada que já mudou.
      if (revision.current === currentRevision) { setResult(answer.trim()); setSources(selected); }
    } catch (cause) { if (revision.current === currentRevision) setError(cause.message); }
    finally { setBusy(false); }
  };
  return <section className="journal-assistant-panel" aria-label="Assistente do Diário">
    <div className="journal-assistant-heading"><div><h2><Icon name="auto_awesome" /> Como posso ajudar?</h2><p>Sugestões para revisar. Nada é aplicado automaticamente.</p></div><button className="journal-icon-button" onClick={onClose} aria-label="Fechar assistente"><Icon name="close" /></button></div>
    <div className="journal-assistant-actions">{JOURNAL_ASSISTANT_ACTIONS.map(item => <button key={item.id} disabled={busy} className={`journal-outline-button ${action === item.id && result ? 'is-active' : ''}`} onClick={() => generate(item.id)}><Icon name={item.icon} />{item.label}</button>)}</div>
    <p className="journal-assistant-scope">Ações de escrita usam apenas a entrada aberta. Padrões analisam o mês {month.split('-').reverse().join('/')}.</p>
    {busy && <p role="status"><Icon name="progress_activity" className="animate-spin" /> Consultando a IA configurada…</p>}
    {error && <p role="alert" className="journal-assistant-error">{error}</p>}
    {result && <div className="journal-assistant-result"><span className="journal-eyebrow">{action === 'revise' ? 'Texto revisado — compare antes de aplicar' : 'Sugestão da IA'}</span><div className="journal-assistant-text">{result}</div>
      {action === 'patterns' && <div className="journal-assistant-sources"><strong>Entradas usadas ({sources.length})</strong>{sources.map(item => <button key={item.id} onClick={() => onOpen(item.id)}>{item.entryDate.split('-').reverse().join('/')} · {item.title || 'Sem título'}</button>)}</div>}
      <div className="journal-assistant-actions">{action === 'revise' ? <button className="journal-primary-button" onClick={() => { if (window.confirm('Substituir o texto da entrada pela revisão?')) onReplace(result); }}>Aplicar revisão</button> : <button className="journal-primary-button" onClick={() => onAppend(result)}>Adicionar à entrada</button>}<button className="journal-outline-button" onClick={() => setResult('')}>Dispensar</button></div>
    </div>}
  </section>;
}
