// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { parseNote, splitNotes, parseEnexDate, enmlToHtml } from './enex'

const xml = fs.readFileSync(process.cwd() + '/tests/fixtures/Sample Notebook.enex', 'utf8')
const all = async () => { const out = []; for await (const n of splitNotes([xml])) out.push(parseNote(n)); return out }

describe('ENEX import', () => {
  it('parses dates (UTC)', () => { expect(parseEnexDate('20231004T120000Z')).toBe(Date.UTC(2023, 9, 4, 12, 0, 0)); expect(parseEnexDate('bad')).toBeNull() })
  it('splits notes even across arbitrary chunk boundaries', async () => {
    const chunks = xml.match(/[\s\S]{1,37}/g)!; const out: string[] = []; for await (const n of splitNotes(chunks)) out.push(n)
    expect(out.length).toBe(4); expect(out.every(n => n.startsWith('<note>') && n.endsWith('</note>'))).toBe(true)
  })
  it('title, tags, created/updated', async () => {
    const [n] = await all()
    expect(n.title).toBe('Shit to Do - October 4th'); expect(n.tags).toEqual(['todo', 'personal'])
    expect(n.created).toBe(Date.UTC(2023, 9, 4, 12)); expect(n.updated).toBe(Date.UTC(2023, 9, 5, 8, 30))
  })
  it('legacy en-todo lines → grouped task lists with checked state; inline <br> todos split', async () => {
    const [n] = await all(); const d = new DOMParser().parseFromString(n.html, 'text/html')
    const lists = d.querySelectorAll('ul[data-type=taskList]'); expect(lists.length).toBe(2)
    expect([...lists[0].querySelectorAll('li')].map(l => [l.textContent, l.getAttribute('data-checked')])).toEqual([['Soccer at 7pm', 'false']])
    expect([...lists[1].querySelectorAll('li')].map(l => [l.textContent, l.getAttribute('data-checked')])).toEqual([
      ['Hire cleaner for LA house', 'false'], ['Figure out Tesla -- Pay $1,300', 'true'], ['Pay for Storage Unit', 'false'], ['Inline second item', 'true']])
    expect(d.querySelector('p')!.textContent).toBe('Personal')
  })
  it('nested lists, ordered list, table, fonts/colors/sizes, safe links', async () => {
    const [, n] = await all(); const d = new DOMParser().parseFromString(n.html, 'text/html')
    expect(d.querySelector('ul > li > ul > li')!.textContent).toBe('One.a'); expect(d.querySelector('ol li')!.textContent).toBe('First')
    expect(d.querySelectorAll('table tr').length).toBe(2); expect(d.querySelector('th')!.textContent).toBe('Name')
    expect(d.querySelector('td span')!.getAttribute('style')).toMatch(/font-family: Georgia.*color: #ff0000|color: #ff0000/)
    expect(n.html).toMatch(/<span style="[^"]*font-size: 24px[^"]*">Big blue/); expect(n.html).toMatch(/color: rgb\(0, 0, 255\)[^"]*">Big blue/); expect(d.querySelector('strong')!.textContent).toBe('bold')
    const links = [...d.querySelectorAll('a')]; expect(links[0].getAttribute('href')).toBe('https://example.com'); expect(links[1].hasAttribute('href')).toBe(false)
  })
  it('small image → data URL; other attachment + en-crypt → placeholders; script dropped; source-url', async () => {
    const [, , n] = await all()
    expect(n.html).toMatch(/<img src="data:image\/png;base64,iVBOR[^"]+" alt="dot.png">/)
    expect(n.html).toContain('[attachment: invoice.pdf]'); expect(n.skipped).toEqual(['invoice.pdf'])
    expect(n.html).toContain('[encrypted content'); expect(n.html).not.toMatch(/script|alert/)
    expect(n.sourceUrl).toBe('https://example.com/article'); expect(n.html).toContain('href="https://example.com/article"')
  })
  it('Evernote v10 checklist (--en-todo / --en-checked) and entities', async () => {
    const [, , , n] = await all(); const d = new DOMParser().parseFromString(n.html, 'text/html')
    expect([...d.querySelectorAll('ul[data-type=taskList] > li')].map(l => [l.textContent, l.getAttribute('data-checked')])).toEqual([['Done thing', 'true'], ['Open thing', 'false']])
    expect(n.text).toContain('after & done')
  })
  it('large images become placeholders', () => {
    const big = { hash: 'h', mime: 'image/jpeg', name: 'huge.jpg', size: 5 * 1024 * 1024, base64: 'AAAA' }
    const r = enmlToHtml('<en-note><en-media hash="h" type="image/jpeg"/></en-note>', [big])
    expect(r.html).toContain('[attachment: huge.jpg (5120 KB, too large to embed)]'); expect(r.skipped).toEqual(['huge.jpg'])
  })
})
