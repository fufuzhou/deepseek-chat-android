/** Official GET /user/balance. Android uses a restricted native transport to avoid CORS. */
export type BalanceInfo = {
  currency: 'CNY' | 'USD'
  total_balance: string
  granted_balance: string
  topped_up_balance: string
}
export type Balance = {
  is_available: boolean
  balance_infos: BalanceInfo[]
}
type NativeBridge = {
  postMessage(payload: string): void
  onmessage: ((event: MessageEvent<string>) => void) | null
}
type NativeResponse = { id: number; data?: unknown; error?: string }
let sequence = 0
const pending = new Map<number, {
  resolve(value: unknown): void
  reject(error: Error): void
  timeout: ReturnType<typeof setTimeout>
}>()
const nativeMessage = (event: MessageEvent<string>) => {
  let data: NativeResponse
  try { data = JSON.parse(event.data) as NativeResponse } catch { return }
  const task = pending.get(data.id)
  if (!task) return
  clearTimeout(task.timeout)
  pending.delete(data.id)
  if (data.error) task.reject(new Error(data.error))
  else task.resolve(data.data)
}
const viaNative = (bridge: NativeBridge, key: string) => {
  const id = ++sequence
  bridge.onmessage = nativeMessage
  return new Promise<unknown>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id)
      reject(new Error('查询余额超时'))
    }, 18000)
    pending.set(id, {resolve, reject, timeout})
    try { bridge.postMessage(JSON.stringify({id, key})) }
    catch (error) {
      clearTimeout(timeout)
      pending.delete(id)
      reject(error instanceof Error ? error : new Error(String(error)))
    }
  })
}
const balanceString = (item: unknown): item is string => typeof item === 'string' &&
  item.length < 80 && Number.isFinite(Number(item)) && Number(item) >= 0
export async function fetchBalance(apiKey: string): Promise<Balance> {
  if (!apiKey) throw new Error('请先设置 API Key')
  const bridge = (window as Window & {AndroidBalance?: NativeBridge}).AndroidBalance
  let body: unknown
  if (bridge && typeof bridge.postMessage === 'function') {
    body = await viaNative(bridge, apiKey)
  } else {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 18000)
    try {
      const response = await fetch('https://api.deepseek.com/user/balance', {
        method: 'GET',
        headers: {Authorization: `Bearer ${apiKey}`},
        cache: 'no-store',
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(`余额接口返回 HTTP ${response.status}`)
      body = await response.json()
    } finally { clearTimeout(timeout) }
  }
  if (!body || typeof body !== 'object') throw new Error('余额接口响应无效')
  const data = body as Partial<Balance>
  if (typeof data.is_available !== 'boolean' || !Array.isArray(data.balance_infos))
    throw new Error('余额接口格式不正确')
  const infos = data.balance_infos.filter((info): info is BalanceInfo =>
    info !== null && typeof info === 'object' &&
    (info.currency === 'CNY' || info.currency === 'USD') &&
    balanceString(info.total_balance) && balanceString(info.granted_balance) &&
    balanceString(info.topped_up_balance))
  return {is_available: data.is_available, balance_infos: infos}
}
