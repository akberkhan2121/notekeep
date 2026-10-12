import { describe, it, expect } from 'vitest'
import { merge } from './merge'
const r = (id: string, updatedAt: number, dirty = 0, v = '') => ({ id, updatedAt, dirty, v })
describe('merge (LWW)', () => {
  it('pulls remote-only rows', () => expect(merge([], [r('a', 1)]).toLocal.map(x => x.id)).toEqual(['a']))
  it('pushes dirty local-only rows, ignores clean ones', () => expect(merge([r('a', 1, 1), r('b', 1, 0)], []).toRemote.map(x => x.id)).toEqual(['a']))
  it('newer remote wins over older dirty local', () => {
    const m = merge([r('a', 1, 1, 'L')], [r('a', 2, 0, 'R')]); expect(m.toLocal[0].v).toBe('R'); expect(m.toRemote).toEqual([])
  })
  it('newer local (offline edit) wins over older remote', () => {
    const m = merge([r('a', 5, 1, 'L')], [r('a', 2, 0, 'R')]); expect(m.toRemote[0].v).toBe('L'); expect(m.toLocal).toEqual([])
  })
  it('identical clean rows are a no-op', () => expect(merge([r('a', 3)], [r('a', 3)])).toEqual({ toLocal: [], toRemote: [] }))
  it('tie with dirty local pushes local', () => expect(merge([r('a', 3, 1, 'L')], [r('a', 3, 0, 'R')]).toRemote[0].v).toBe('L'))
})
