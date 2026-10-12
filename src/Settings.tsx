import { useEffect, useState } from 'react'
import { X, SlidersHorizontal, RotateCcw, ChevronDown, Download } from 'lucide-react'
import ImportPanel from './import/ImportPanel'
import type { Notebook } from './db'
import { FONTS, SIZES, COLORS, DEFAULT_COLOR, BLOCK_LABELS, DEFAULT_FONTS, saveFonts, useFonts, type BlockKey, type FontPref } from './settings'

function Select({ value, options, onChange, label, swatch }: { value: string; options: { label: string; value: string }[]; onChange: (v: string) => void; label: string; swatch?: boolean }) {
  return <label className={'fsel' + (swatch ? ' sw' : '')}>
    {swatch && <span className="swatch-ring"><span style={{ background: value || DEFAULT_COLOR }} /></span>}
    <select aria-label={label} value={value} onChange={e => onChange(e.target.value)}>{options.map(o => <option key={o.label} value={o.value}>{o.label}</option>)}</select>
    <ChevronDown size={16} className="fsel-cv" />
  </label>
}

export default function Settings({ onClose, section = 'prefs', notebooks = [], onImported = () => {} }: { onClose: () => void; section?: 'prefs' | 'import'; notebooks?: Notebook[]; onImported?: () => void }) {
  const [sec, setSec] = useState(section)
  const fonts = useFonts()
  const [sub, setSub] = useState('Notes')
  useEffect(() => { const f = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f) }, [onClose])
  const upd = (k: BlockKey, p: Partial<FontPref>) => saveFonts({ ...fonts, [k]: { ...fonts[k], ...p } })
  const same = (k: BlockKey) => JSON.stringify(fonts[k]) === JSON.stringify(DEFAULT_FONTS[k])
  return <div className="modal-bg" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <div className="modal" role="dialog" aria-modal="true" aria-label="Settings">
      <header className="mh"><h1>Settings</h1><button className="ic" title="Close settings" onClick={onClose}><X size={20} /></button></header>
      <div className="mbody">
        <nav className="snav">
          <button className={'snav-i' + (sec === 'prefs' ? ' on' : '')} onClick={() => setSec('prefs')}><SlidersHorizontal size={18} /> Preferences {sec === 'prefs' && <span className="bdot" />}</button>
          <button className={'snav-i' + (sec === 'import' ? ' on' : '')} onClick={() => setSec('import')}><Download size={18} /> Import {sec === 'import' && <span className="bdot" />}</button>
        </nav>
        {sec === 'import' ? <><nav className="ssub"><button className="ssub-i on">Evernote (.enex)</button></nav><ImportPanel notebooks={notebooks} onImported={onImported} /></> : <><nav className="ssub">{['Notes'].map(x => <button key={x} className={'ssub-i' + (sub === x ? ' on' : '')} onClick={() => setSub(x)}>{x}</button>)}</nav>
        <section className="spanel">
          <h2>Default font settings</h2>
          <p className="sdesc">Set the default font, size and color for each text style. <strong>Applies to all notes</strong>, including existing ones; text you formatted explicitly keeps its formatting. Sizes use the toolbar's scale (15 = normal text).</p>
          {(Object.keys(BLOCK_LABELS) as BlockKey[]).map(k => <div className="frow" key={k} data-block={k}>
            <div className="flabel">{BLOCK_LABELS[k]}</div>
            <Select label={BLOCK_LABELS[k] + ' font'} value={fonts[k].family} options={FONTS} onChange={v => upd(k, { family: v })} />
            <Select label={BLOCK_LABELS[k] + ' size'} value={String(fonts[k].size)} options={[...new Set([...SIZES, fonts[k].size])].sort((a, b) => a - b).map(s => ({ label: String(s), value: String(s) }))} onChange={v => upd(k, { size: Number(v) })} />
            <Select label={BLOCK_LABELS[k] + ' color'} value={fonts[k].color} options={COLORS} onChange={v => upd(k, { color: v })} swatch />
            <button className="ic reset" title={'Reset ' + BLOCK_LABELS[k] + ' to default'} disabled={same(k)} onClick={() => saveFonts({ ...fonts, [k]: DEFAULT_FONTS[k] })}><RotateCcw size={16} /></button>
          </div>)}
        </section></>}
      </div>
    </div>
  </div>
}
