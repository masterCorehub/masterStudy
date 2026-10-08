import React from "react";
import { Icon } from "../../ui/Icon";
import { READER_THEMES, READER_FONTS, DEFAULT_READER_SETTINGS } from "./readerAppearance";

export function ReaderSettingsPanel({ settings, onUpdate, onClose, fileType }) {
  const pdf = fileType === "pdf";
  const range = (label, field, min, max, step, suffix = "") => <label className="reader-adjustment"><span>{label}<small>{settings[field]}{suffix}</small></span><input aria-label={label} type="range" min={min} max={max} step={step} value={settings[field] ?? DEFAULT_READER_SETTINGS[field]} onChange={e => onUpdate({ [field]: Number(e.target.value) })} /></label>;
  return <section className="reader-appearance" role="dialog" aria-label="Temas e ajustes">
    <div className="reader-panel-heading"><h2>Temas e ajustes</h2><button aria-label="Fechar ajustes" onClick={onClose}><Icon name="close" /></button></div>
    <p className="reader-panel-intro">Deixe a leitura confortável para você.</p>
    <div className="reader-paper-themes">{Object.entries(READER_THEMES).map(([id, theme]) => <button key={id} aria-pressed={settings.theme === id} onClick={() => onUpdate({ theme: id })} style={{ background: theme.bg, color: theme.text }}><span style={{ fontFamily: READER_FONTS.serif }}>Aa</span><small>{theme.label}</small>{settings.theme === id && <Icon name="check_circle" />}</button>)}</div>
    {pdf ? <>
      {range("Zoom do PDF", "pdfZoom", 1, 3, .1, "×")}
      <label className="reader-adjustment"><span>Enquadramento</span><select aria-label="Enquadramento do PDF" value={settings.pdfFit || "page"} onChange={e => onUpdate({ pdfFit: e.target.value, pdfZoom: 1 })}><option value="page">Página inteira</option><option value="width">Largura da página</option></select></label>
      <p className="reader-panel-intro">O PDF preserva as fontes e a diagramação do arquivo.</p>
    </> : <>
      <div className="reader-type-size"><button aria-label="Diminuir fonte" disabled={settings.fontSize <= 12} onClick={() => onUpdate({ fontSize: Math.max(12, settings.fontSize - 1) })}>A</button><span>{settings.fontSize} px</span><button aria-label="Aumentar fonte" disabled={settings.fontSize >= 36} onClick={() => onUpdate({ fontSize: Math.min(36, settings.fontSize + 1) })}>A</button></div>
      <label className="reader-adjustment"><span>Fonte</span><select aria-label="Fonte da leitura" value={settings.fontFamily} onChange={e => onUpdate({ fontFamily: e.target.value })}><option value="serif">Georgia</option><option value="sans">Inter</option><option value="mono">Monoespaçada</option></select></label>
      <details className="reader-customize"><summary>Personalizar o texto <Icon name="tune" /></summary>
        {range("Espaçamento entre linhas", "lineSpacing", 1.2, 2.4, .05)}
        {range("Margens da página", "margin", 16, 72, 4, " px")}
        <label className="reader-adjustment"><span>Texto justificado</span><input type="checkbox" checked={settings.textAlign === "justify"} onChange={e => onUpdate({ textAlign: e.target.checked ? "justify" : "left" })} /></label>
      </details>
    </>}
    <div className="reader-adjustment"><span>Como ler</span><div className="reader-segmented">{[["paginated", "Páginas"], ["continuous", "Rolagem"]].map(([id, label]) => <button key={id} aria-pressed={settings.scrollMode === id} onClick={() => onUpdate({ scrollMode: id })}>{label}</button>)}</div></div>
    <label className="reader-adjustment"><span>Páginas lado a lado</span><input type="checkbox" checked={settings.spread === "double" && settings.scrollMode !== "continuous"} onChange={e => onUpdate({ spread: e.target.checked ? "double" : "single", scrollMode: "paginated" })} /></label>
    <button className="reader-reset" onClick={() => onUpdate({ ...DEFAULT_READER_SETTINGS })}>Restaurar ajustes de leitura</button>
  </section>;
}
