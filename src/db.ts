import { openDB, type IDBPDatabase } from 'idb'
export interface Notebook { id: string; name: string; stack?: string; createdAt: number }
export interface Note { id: string; title: string; html: string; text: string; notebookId: string; tags: string[]; pinned: boolean; deletedAt: number | null; createdAt: number; updatedAt: number }
let dbp: Promise<IDBPDatabase> | null = null
const db = () => (dbp ??= openDB('notekeep', 1, { upgrade(d) { d.createObjectStore('notes', { keyPath: 'id' }); d.createObjectStore('notebooks', { keyPath: 'id' }) } }))
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
export const all = async <T,>(s: 'notes' | 'notebooks') => (await db()).getAll(s) as Promise<T[]>
export const put = async (s: 'notes' | 'notebooks', v: unknown) => { await (await db()).put(s, v) }
export const del = async (s: 'notes' | 'notebooks', id: string) => { await (await db()).delete(s, id) }
