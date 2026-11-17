/** Android-only zip export via an origin-scoped WebMessage bridge. */
type Bridge = {
  postMessage(s: string): void
  onmessage: ((e: MessageEvent<string>) => void) | null
}
type Response = { seq: number; ok: boolean; error?: string }
type Pending = { resolve(): void; reject(e: Error): void; timeout: ReturnType<typeof setTimeout> }
let sequence = 0
const pending = new Map<number, Pending>()
const onReply = (event: MessageEvent<string>) => {
  let msg: Response
  try { msg = JSON.parse(event.data) as Response } catch { return }
  const task = pending.get(msg.seq)
  if (!task) return
  clearTimeout(task.timeout)
  pending.delete(msg.seq)
  if (msg.ok) task.resolve()
  else task.reject(new Error(msg.error || 'Android export failed'))
}
function send(bridge: Bridge, data: object, ms = 120000): Promise<void> {
  const seq = ++sequence
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(seq)
      reject(new Error('Export timed out'))
    }, ms)
    pending.set(seq, {resolve, reject, timeout})
    try { bridge.postMessage(JSON.stringify({...data, seq})) }
    catch (error) {
      clearTimeout(timeout)
      pending.delete(seq)
      reject(error instanceof Error ? error : new Error(String(error)))
    }
  })
}
let exporting = false
export async function saveArchive(name: string, blob: Blob): Promise<void> {
  const bridge = (window as Window & {AndroidExport?: Bridge}).AndroidExport
  if (!bridge || typeof bridge.postMessage !== 'function') {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
    return
  }
  if (exporting) throw new Error('Export already in progress')
  exporting = true
  bridge.onmessage = onReply
  const id = Date.now() + '-' + Math.random().toString(36).slice(2)
  let started = false
  try {
    await send(bridge, {type: 'start', id, name}, 600000)
    started = true
    for (let offset = 0; offset < blob.size; offset += 32768) {
      const bytes = new Uint8Array(await blob.slice(offset, offset + 32768).arrayBuffer())
      let binary = ''
      for (const b of bytes) binary += String.fromCharCode(b)
      await send(bridge, {type: 'chunk', id, data: btoa(binary)})
    }
    await send(bridge, {type: 'end', id})
  } catch (error) {
    if (started) await send(bridge, {type: 'abort', id}, 10000).catch(() => {})
    throw error
  } finally { exporting = false }
}
