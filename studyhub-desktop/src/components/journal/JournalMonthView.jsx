import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../ui/Icon';
import { getJournalMonthGrid } from '../../domain/journal.js';
import { getLocalFileUrl } from '../../utils/localFileUrl';
import { collaborationCloud, collaborationCloudConfigured } from '../../services/collaboration-cloud';
const shiftMonth = (month, amount) => { const [year, index] = month.split('-').map(Number); const date = new Date(year, index - 1 + amount, 1); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; };
function Photo({ photo, urls, className }) {
  const [failed, setFailed] = useState(false);
  const source = urls[photo?.id] || (photo?.localPath ? getLocalFileUrl(photo.localPath) : '');
  useEffect(() => setFailed(false), [source]);
  return source && !failed ? <img className={className} src={source} alt={photo.caption || 'Foto da entrada'} onError={() => setFailed(true)} /> : <span className={`${className} journal-month-photo-placeholder`}><Icon name="photo" /><span>Foto</span></span>;
}
export function JournalMonthView({ entries, month, selectedDate, today, onMonthChange, onSelectDate, onOpen, onNew, onReflect }) {
  const days = useMemo(() => {
    const grid = getJournalMonthGrid(month, entries);
    // Preserve semanas completas sem acrescentar uma semana fora do mês.
    const lastDay = grid.findLastIndex(day => day.currentMonth);
    return grid.slice(0, Math.ceil((lastDay + 1) / 7) * 7);
  }, [entries, month]);
  const grouped = useMemo(() => { const map = new Map(); entries.forEach(entry => map.set(entry.entryDate, [...(map.get(entry.entryDate) || []), entry])); return map; }, [entries]);
  const selected = grouped.get(selectedDate) || [];
  const [urls, setUrls] = useState({});
  const photos = useMemo(() => {
    const visible = new Set(days.map(day => day.dateKey)); visible.add(selectedDate);
    return [...new Map(entries.filter(entry => visible.has(entry.entryDate)).flatMap(entry => entry.photos || []).filter(photo => photo.cloudObjectPath).map(photo => [photo.id, photo])).values()];
  }, [entries, days, selectedDate]);
  useEffect(() => {
    let active = true;
    if (!collaborationCloudConfigured) return;
    Promise.all(photos.map(async photo => { try { return [photo.id, await collaborationCloud.createSignedFileUrl(photo.cloudObjectPath)]; } catch { return [photo.id, '']; } })).then(result => { if (active) setUrls(Object.fromEntries(result)); });
    return () => { active = false; };
  }, [photos]);
  return <div className="journal-month-view"><section className="journal-month-main"><header><h2>{new Date(`${month}-01T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</h2><div><button className="journal-icon-button" aria-label="Mês anterior" onClick={() => onMonthChange(shiftMonth(month, -1))}><Icon name="chevron_left" /></button><button className="journal-outline-button" onClick={() => { onMonthChange(today.slice(0, 7)); onSelectDate(today); }}>Hoje</button><button className="journal-icon-button" aria-label="Próximo mês" onClick={() => onMonthChange(shiftMonth(month, 1))}><Icon name="chevron_right" /></button></div></header>
    <div className="journal-month-week">{['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'].map(day => <span key={day}>{day}</span>)}</div>
    <div className="journal-month-grid">{days.map(day => {
      const daily = grouped.get(day.dateKey) || []; const photoEntry = daily.find(entry => entry.photos?.length); const photo = photoEntry?.photos?.find(item => item.id === photoEntry.coverPhotoId) || photoEntry?.photos?.[0];
      const photoCount = daily.reduce((total, entry) => total + (entry.photos?.length || 0), 0);
      return <button key={day.dateKey} className={`journal-month-day ${daily.length ? 'has-entry' : ''} ${selectedDate === day.dateKey ? 'is-selected' : ''} ${!day.currentMonth ? 'is-outside' : ''}`} aria-pressed={selectedDate === day.dateKey} aria-label={`${day.dateKey.split('-').reverse().join('/')} · ${daily.length} entrada(s), ${photoCount} foto(s)`} onClick={() => onSelectDate(day.dateKey)}><span className="journal-month-number"><span className={day.isToday ? 'is-today' : ''}>{day.day}</span>{daily.length > 0 && <span className="journal-month-entry-count">{daily.length} <Icon name="edit_note" /></span>}</span>{photo ? <Photo photo={photo} urls={urls} className="journal-month-thumb" /> : daily.length ? <span className="journal-month-caption">{daily[0].title || 'Entrada do diário'}</span> : null}{photoCount > 1 && <span className="journal-month-photo-count">+{photoCount - 1}</span>}</button>;
    })}</div><p className="journal-month-legend"><Icon name="edit_note" /> Dias preenchidos · selecione uma data para ver suas entradas</p>
  </section><aside className="journal-month-detail"><span className="journal-eyebrow">{new Date(`${selectedDate}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>{selected.length ? selected.map(entry => { const photo = entry.photos?.find(item => item.id === entry.coverPhotoId) || entry.photos?.[0]; return <article key={entry.id}><h3>{entry.title || 'Entrada do diário'}</h3>{photo && <Photo photo={photo} urls={urls} className="journal-month-detail-photo" />}<p>{entry.content?.slice(0, 230) || 'Uma memória em imagens.'}{entry.content?.length > 230 ? '…' : ''}</p><small>{entry.photos?.length || 0} foto(s)</small><button className="journal-primary-button" onClick={() => onOpen(entry.id)}><Icon name="menu_book" /> Abrir entrada</button></article>; }) : <article><h3>Um dia para registrar</h3><p>Nenhuma entrada nesta data. Comece com uma frase ou uma foto.</p></article>}<button className="journal-outline-button" onClick={() => onNew(selectedDate)}><Icon name="add" /> Escrever neste dia</button><button className="journal-outline-button" onClick={onReflect}><Icon name="auto_awesome" /> Refletir sobre este mês</button></aside></div>;
}
