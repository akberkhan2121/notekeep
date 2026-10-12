# Evernote Web Client — Analysis (for the Notekeep clone)

Legend: **[O]** observed directly (HTTP fetches, static bundle analysis) · **[I]** inferred from public knowledge/marketing/help pages, not verified in a logged-in session.
No account was logged into. About 30 requests in total, rate-limited.

## Method
- `curl https://www.evernote.com/client/web` → **[O]** 302 to `https://www.evernote.com/Login.action?targetUrl=/client/web` → `https://accounts.evernote.com/login`. Headers: `server: Evernote/1.0`, `x-app-server: production-haproxy-…/shard-reg/production-monolith-…`, Fastly cache (`x-served-by: cache-…`), `x-frame-options: SAMEORIGIN`.
- Downloaded the 25 JS/CSS chunks from the login page (1.5 MB) to `/workspace/evtarget/app`. Ran **REA** `analyze-javascript-application` on them (static, inert parse). REA parsed 24 JS files, 420,866 AST nodes, 667 modules, 2,025 findings, 0 parse failures. Output: `/workspace/evtarget/rea.json` (40 MB evidence).
- Fetched the evernote.com features page for the feature headings.
- The authenticated note client bundle is behind login, so it was **not** observed.

## Notable tech
- **[O]** Accounts/login front end: **Next.js App Router** (`/_next/static/chunks/app/(login-layout)/login/page-*.js`, route groups), **React 19.2 canary** (`19.2.0-canary-0bdb9206-20250818`), webpack chunks.
- **[O]** Telemetry/third-party: Sentry (145 refs), Segment (70), Amplitude, reCAPTCHA.
- **[O]** Auth API surface (relative `/api/*`): `checkEmail`, `checkPassword`, `check2FA`, `checkLoginWithCode`, `checkRegistrationWithCode`, `checkPasswordRegistration`, `forgotPassword`, `resetPassword`, `verifyPasswordResetLink`, `checkForceVerification`, `getEmail`, `business`, `generateZendeskJWT`, `getMcpGateContext`, `setMcpConsent` (this suggests an MCP/AI-integration consent gate).
- **[O]** Environments/hosts: `api.evernote.com`, `api.staging|testing.evernote.com`, `accounts.{stage,preprod3,development}.evernote.com`, `app.preprod3.evernote.com/client/web`, `/billy/subscriptions`, `/auth/join-public-note`.
- **[I]** Note client: React SPA at `/client/web`, sharded back end ("shard-reg", the classic `NoteStore` per shard). Notes are stored as **ENML** (an XHTML subset). Thrift-based EDAM API plus newer sync services. Real-time sync across devices.

## Feature inventory (all [I] unless noted)
| Area | Evernote behavior | Notekeep |
|---|---|---|
| Notebooks | Containers for notes; one default notebook | ✅ |
| Stacks | Groups of notebooks (one level) | ✅ (notebook `stack` field) |
| Notes | Title + rich content, created/updated times | ✅ |
| Rich text editor | Headings, B/I/U/S, highlight, lists, checklists, code, quote, links, dividers, tables, attachments, ink | ✅ except tables, attachments, ink |
| Tags | Many-to-many, can be nested | ✅ flat tags |
| Search | Full text plus operators (`tag:`, `notebook:`, `intitle:`), OCR in images | ✅ multi-term + `tag:` operator; no OCR |
| Shortcuts | Pinned notes/notebooks/tags in the sidebar | ✅ pinned notes |
| Trash | Soft delete, restore, empty | ✅ |
| Tasks | Standalone tasks with due dates (newer Evernote) plus in-note checklists | ⚠ in-note checklists only |
| Sharing | Share note/notebook with people, public links | ⚠ local "copy link" stub only |
| Sync | Cloud sync across devices | ❌ local IndexedDB only |
| Also: calendar, web clipper, templates, AI search ("Search less, do more", **[O]** headings on the features page) | ❌ |

## UI layout [I, consistent with public screenshots]
1. Dark left **sidebar**: account, search, "+ New", Home, Shortcuts, Notes, Tasks, Notebooks (with stacks), Tags, Shared, Trash.
2. Middle **note list**: title, snippet, date, sort options, note count.
3. Right **editor**: notebook picker, share/actions, title, tag bar, formatting toolbar, body.

## Data model
**[I]** EDAM: `Notebook{guid,name,stack,…}`, `Note{guid,title,content(ENML),created,updated,deleted,active,notebookGuid,tagGuids,resources[]}`, `Tag{guid,name,parentGuid}`, `SavedSearch`, `Resource` (attachments), plus `updateSequenceNum` for sync.
Notekeep (simplified): `Notebook{id,name,stack?,createdAt}`, `Note{id,title,html,text,notebookId,tags[],pinned,deletedAt,createdAt,updatedAt}`, stored in IndexedDB db `notekeep`.
