/**
 * Non-authoritative CNY estimates for DeepSeek Messages usage (2026-11-17).
 * Pricing: https://api-docs.deepseek.com/zh-cn/quick_start/pricing/
 * Tool usage: https://api-docs.deepseek.com/zh-cn/guides/web_tools/
 */
export type Usage = {
  input_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens?: number
  output_tokens: number
  server_tool_use?: {
    tool_search?: number
    tool_fetch?: number
    tool_image_search?: number
    web_search_requests?: number
    web_fetch_requests?: number
  }
}
export type PriceTier = 'peak' | 'offpeak'
export type Charge = {
  model: string
  tier: PriceTier
  holidayKnown: boolean
  at: number
  missed: number
  cached: number
  output: number
  searches: number
  fetches: number
  tokensCny: number
  toolsCny: number
  totalCny: number
}
const holidays2026 = [
  ['01-01', '01-03'], ['02-15', '02-23'], ['04-04', '04-06'],
  ['05-01', '05-05'], ['06-19', '06-21'], ['09-25', '09-27'],
  ['10-01', '10-07'],
] as const
const goodNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
/** Beijing clock-time and official 2026 holiday dates; future holidays may need updating. */
export function pricingPeriod(at: number): { tier: PriceTier; holidayKnown: boolean } {
  const pieces = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(at))
  const part = (type: string) => pieces.find((piece) => piece.type === type)?.value ?? ''
  const year = part('year')
  const day = `${part('month')}-${part('day')}`
  const holidayKnown = year === '2026'
  const holiday = holidayKnown && holidays2026.some(([begin, end]) => day >= begin && day <= end)
  const weekday = !['Sat', 'Sun'].includes(part('weekday'))
  const clock = Number(part('hour')) * 60 + Number(part('minute'))
  const peak = weekday && !holiday && ((clock >= 540 && clock < 720) || (clock >= 840 && clock < 1080))
  return {tier: peak ? 'peak' : 'offpeak', holidayKnown}
}
export function calculateCharge(model: string, usage: Usage, at: number): Charge {
  const {tier, holidayKnown} = pricingPeriod(at)
  const high = tier === 'peak'
  const pro = model === 'deepseek-v4-pro'
  const cachedRate = pro ? (high ? 0.30 : 0.15) : (high ? 0.04 : 0.02)
  const missRate = pro ? (high ? 9 : 4.5) : (high ? 2 : 1)
  const outRate = pro ? (high ? 27 : 13.5) : (high ? 8 : 4)
  const missed = goodNumber(usage.input_tokens) + goodNumber(usage.cache_creation_input_tokens)
  const cached = goodNumber(usage.cache_read_input_tokens)
  const output = goodNumber(usage.output_tokens)
  // Only billable tool fields, NOT web_search_requests / web_fetch_requests display counters.
  const searches = goodNumber(usage.server_tool_use?.tool_search) +
    goodNumber(usage.server_tool_use?.tool_image_search)
  const fetches = goodNumber(usage.server_tool_use?.tool_fetch)
  const tokensCny = (missed * missRate + cached * cachedRate + output * outRate) / 1_000_000
  const toolsCny = (searches + fetches) * 0.005
  return {
    model, tier, holidayKnown, at, missed, cached, output, searches, fetches,
    tokensCny, toolsCny, totalCny: tokensCny + toolsCny,
  }
}
/** Provisional display only: actual cost uses message_delta.usage. */
export function approximateOutputTokens(text: string): number {
  let chars = 0
  for (const c of text) chars += c.codePointAt(0)! > 127 ? 1 : 0.35
  return chars
}
