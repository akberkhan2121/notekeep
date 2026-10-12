// Generates tests/fixtures/Sample Notebook.enex (run: node tests/fixtures/make-sample.mjs)
import crypto from 'node:crypto'; import fs from 'node:fs'
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const pngHash = crypto.createHash('md5').update(Buffer.from(png, 'base64')).digest('hex')
const pdf = Buffer.from('%PDF-1.4 fake pdf for tests').toString('base64')
const pdfHash = crypto.createHash('md5').update(Buffer.from(pdf, 'base64')).digest('hex')
const enml = body => `<![CDATA[<?xml version="1.0" encoding="UTF-8" standalone="no"?><!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd"><en-note>${body}</en-note>]]>`
const note = ({ title, body, created = '20231004T120000Z', updated = '20231005T083000Z', tags = [], res = '', attrs = '' }) =>
  `<note><title>${title}</title><created>${created}</created><updated>${updated}</updated>${tags.map(t => `<tag>${t}</tag>`).join('')}<note-attributes>${attrs}</note-attributes><content>${enml(body)}</content>${res}</note>`
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE en-export SYSTEM "http://xml.evernote.com/pub/evernote-export4.dtd">
<en-export export-date="20261012T200000Z" application="Evernote" version="10.0">
${note({ title: 'Shit to Do - October 4th', tags: ['Todo', 'personal'], body: '<div>Personal</div><div><en-todo checked="false"/>Soccer at 7pm</div><div><br/></div><div>LA</div><div><en-todo checked="false"/>Hire cleaner for LA house</div><div><en-todo checked="true"/>Figure out Tesla -- Pay $1,300</div><div><en-todo/>Pay for Storage Unit<br/><en-todo checked="true"/>Inline second item</div>' })}
${note({ title: 'Lists and table', body: '<ul><li>One<ul><li>One.a</li><li>One.b</li></ul></li><li>Two</li></ul><ol><li>First</li></ol><table><tr><th>Name</th><th>Qty</th></tr><tr><td>Apples</td><td><font color="#ff0000" face="Georgia">3</font></td></tr></table><div><span style="font-size: 24px; color: rgb(0, 0, 255);">Big blue</span> and <b>bold</b> <a href="https://example.com">link</a> <a href="javascript:alert(1)">bad</a></div>' })}
${note({ title: 'Image note', created: '20220101T000000Z', updated: '20220102T000000Z', attrs: '<source-url>https://example.com/article</source-url>',
  body: `<div>Look:</div><en-media hash="${pngHash}" type="image/png"/><div><en-media hash="${pdfHash}" type="application/pdf"/></div><en-crypt hint="pw">XXXX</en-crypt><script>alert(1)</script>`,
  res: `<resource><data encoding="base64">${png}</data><mime>image/png</mime><resource-attributes><file-name>dot.png</file-name></resource-attributes></resource><resource><data encoding="base64">${pdf}</data><mime>application/pdf</mime><resource-attributes><file-name>invoice.pdf</file-name></resource-attributes></resource>` })}
${note({ title: 'New-style checklist', body: '<ul style="--en-todo:true;"><li style="--en-checked:true;"><div>Done thing</div></li><li style="--en-checked:false;"><div>Open thing</div></li></ul><p>after &amp; done&nbsp;!</p>' })}
</en-export>`
fs.writeFileSync(new URL('./Sample Notebook.enex', import.meta.url), xml)
console.log('written', xml.length, 'bytes')
