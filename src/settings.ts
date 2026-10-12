import { useSyncExternalStore } from 'react'
import { getSetting, putSetting } from './db'

/** Toolbar/settings size unit: "15" = normal text. Rendered px = value * 16 / 15 (so 15 → 16px, H1 25 → 26.67px). */
export const UNIT = 16 / 15
export const toPx = (v: number) => +(v * UNIT).toFixed(2) + 'px'
export const fromPx = (px: string) => Math.round(parseFloat(px) / UNIT)

export const FONTS = [
  { label: 'Sans Serif', value: '' },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Slab Serif', value: '"Roboto Slab", Rockwell, "Courier Bold", Georgia, serif' },
  { label: 'Monospace', value: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
  { label: 'Handwritten', value: '"Comic Sans MS", "Bradley Hand", "Segoe Print", cursive' },
]
export const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
export const SIZES = [8, 9, 10, 12, 14, 15, 16, 18, 20, 24, 25, 30, 36, 48, 64]
export const COLORS = [
  { label: 'Default', value: '' }, { label: 'Gray', value: '#737373' }, { label: 'Red', value: '#d93025' }, { label: 'Orange', value: '#e8710a' },
  { label: 'Yellow', value: '#c79100' }, { label: 'Green', value: '#188038' }, { label: 'Blue', value: '#1a73e8' }, { label: 'Indigo', value: '#5565f6' }, { label: 'Purple', value: '#9334e6' },
]
export const DEFAULT_COLOR = '#1f1f1f'

export type BlockKey = 'p' | 'h1' | 'h2' | 'h3' | 'h4'
export interface FontPref { family: string; size: number; color: string }
export type FontSettings = Record<BlockKey, FontPref>
export const BLOCK_LABELS: Record<BlockKey, string> = { p: 'Normal Text', h1: 'Large Header (H1)', h2: 'Medium Header (H2)', h3: 'Small Header (H3)', h4: 'Extra Small Header (H4)' }
export const DEFAULT_FONTS: FontSettings = {
  p: { family: '', size: 15, color: '' }, h1: { family: '', size: 25, color: '' }, h2: { family: '', size: 20, color: '' },
  h3: { family: '', size: 18, color: '' }, h4: { family: '', size: 16, color: '' },
}
export const KEY = 'fontDefaults'

let current: FontSettings = DEFAULT_FONTS
const subs = new Set<() => void>()
const normalize = (v: Partial<FontSettings> | undefined): FontSettings =>
  Object.fromEntries((Object.keys(DEFAULT_FONTS) as BlockKey[]).map(k => [k, { ...DEFAULT_FONTS[k], ...(v?.[k] ?? {}) }])) as FontSettings

export function applyCss(s: FontSettings) {
  const r = document.documentElement.style
  for (const k of Object.keys(s) as BlockKey[]) {
    r.setProperty(`--${k}-ff`, s[k].family || SANS)
    r.setProperty(`--${k}-fs`, toPx(s[k].size))
    r.setProperty(`--${k}-color`, s[k].color || DEFAULT_COLOR)
  }
}
function set(s: FontSettings) { current = s; applyCss(s); subs.forEach(f => f()) }
export const getFonts = () => current
export async function loadFonts() { set(normalize((await getSetting<FontSettings>(KEY))?.value)) }
export async function saveFonts(s: FontSettings) { set(s); await putSetting(KEY, s) }
/** Called by sync after pulling a newer remote value. */
export const setFontsFromRemote = (v: unknown) => set(normalize(v as Partial<FontSettings>))
export const useFonts = () => useSyncExternalStore(f => { subs.add(f); return () => subs.delete(f) }, getFonts)
applyCss(current)
