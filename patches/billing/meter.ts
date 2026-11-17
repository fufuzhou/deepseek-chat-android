import {create} from 'zustand'
import {approximateOutputTokens, calculateCharge, type Charge, type Usage} from './pricing.js'

export type Live = {
  id: string
  model: string
  at: number
  usage: Usage
  approximateOutput: number
}
export type MeterState = {
  accountHash: string | null
  totalCny: number
  requests: number
  last: Charge | null
  revision: number
  live: Live | null
}
type Saved = {totalCny: number; requests: number; last: Charge | null; seen: string[]}
const empty = (): Saved => ({totalCny: 0, requests: 0, last: null, seen: []})
export const useMeter = create<MeterState>(() => ({
  accountHash: null, totalCny: 0, requests: 0, last: null, revision: 0, live: null,
}))
let activeKey: string | null = null
let selection = 0
let writeQueue = Promise.resolve()
const hashes = new Map<string, Promise<string>>()
const fingerprint = (key: string): Promise<string> => {
  let task = hashes.get(key)
  if (!task) {
    task = crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))
      .then((data) => Array.from(new Uint8Array(data), (byte) =>
        byte.toString(16).padStart(2, '0')).join(''))
    hashes.set(key, task)
  }
  return task
}
const storageName = (hash: string) => `ds-chat:billing:v1:${hash}`
const read = (hash: string): Saved => {
  try {
    const raw = localStorage.getItem(storageName(hash))
    if (!raw) return empty()
    const data: unknown = JSON.parse(raw)
    if (!data || typeof data !== 'object') return empty()
    const state = data as Partial<Saved>
    if (!Number.isFinite(state.totalCny) || !Number.isSafeInteger(state.requests)) return empty()
    return {
      totalCny: Math.max(0, state.totalCny ?? 0),
      requests: Math.max(0, state.requests ?? 0),
      last: state.last ?? null,
      seen: Array.isArray(state.seen) ? state.seen.filter((s): s is string =>
        typeof s === 'string').slice(-3000) : [],
    }
  } catch { return empty() }
}
const save = (hash: string, data: Saved) => {
  try { localStorage.setItem(storageName(hash), JSON.stringify(data)) }
  catch { /* Storage quota / private mode: keep UI, but data may not survive restart. */ }
}
/** No API key or message text is written to the billing ledger. */
export function selectBillingAccount(key: string | null): void {
  if (key === activeKey && (key === null || useMeter.getState().accountHash !== null)) return
  activeKey = key
  const id = ++selection
  useMeter.setState({accountHash: null, totalCny: 0, requests: 0, last: null, live: null})
  if (!key) return
  void fingerprint(key).then((hash) => {
    if (selection !== id || activeKey !== key) return
    const saved = read(hash)
    useMeter.setState({
      accountHash: hash, totalCny: saved.totalCny, requests: saved.requests,
      last: saved.last,
    })
  }).catch(() => {})
}
const deltas = new Map<string, {sum: number; updated: number}>()
export function startCharge(id: string, model: string, usage: Usage | undefined, at: number) {
  deltas.set(id, {sum: 0, updated: 0})
  useMeter.setState({
    live: {id, model, at, usage: usage ?? {
      input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0,
    }, approximateOutput: 0},
  })
}
export function addChargeDelta(id: string, text: string) {
  const count = deltas.get(id)
  if (!count) return
  count.sum += approximateOutputTokens(text)
  if (Date.now() - count.updated < 350) return
  count.updated = Date.now()
  useMeter.setState((state) => state.live?.id === id ? ({
    live: {...state.live, approximateOutput: Math.ceil(count.sum)},
  }) : {})
}
export function stopCharge(id: string) {
  deltas.delete(id)
  useMeter.setState((state) => state.live?.id === id ? {live: null} : {})
}
export function finishCharge(key: string, id: string, model: string, usage: Usage, at: number) {
  stopCharge(id)
  if (!key) return
  const charge = calculateCharge(model, usage, at)
  writeQueue = writeQueue.catch(() => {}).then(async () => {
    const hash = await fingerprint(key)
    const saved = read(hash)
    if (saved.seen.includes(id)) return
    saved.totalCny += charge.totalCny
    saved.requests += 1
    saved.last = charge
    saved.seen.push(id)
    saved.seen = saved.seen.slice(-3000)
    save(hash, saved)
    if (activeKey === key) {
      useMeter.setState((state) => ({
        accountHash: hash, totalCny: saved.totalCny,
        requests: saved.requests, last: saved.last, revision: state.revision + 1,
      }))
    }
  })
}
