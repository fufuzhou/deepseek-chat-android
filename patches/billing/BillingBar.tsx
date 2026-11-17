import {useEffect, useState} from 'react'
import {useSettings} from '../../services/settings.js'
import {fetchBalance, type Balance} from '../../services/billing/balance.js'
import {selectBillingAccount, useMeter} from '../../services/billing/meter.js'
import {calculateCharge} from '../../services/billing/pricing.js'
import styles from './BillingBar.module.css'

const cny = (value: number): string => {
  if (!Number.isFinite(value)) return '—'
  const digits = value > 0 && value < 0.0001 ? 6 : 4
  return `¥${value.toFixed(digits)}`
}

export const BillingBar = () => {
  const apiKey = useSettings((state) => state.apiKey)
  const locale = useSettings((state) => state.locale)
  const zh = locale === 'zh-CN'
  const meter = useMeter()
  const [balance, setBalance] = useState<Balance | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [time, setTime] = useState<number | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => { selectBillingAccount(apiKey) }, [apiKey])
  useEffect(() => {
    if (!apiKey) return
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') setRefresh((n) => n + 1)
    }, 90000)
    const visible = () => {
      if (document.visibilityState === 'visible') setRefresh((n) => n + 1)
    }
    document.addEventListener('visibilitychange', visible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [apiKey])
  useEffect(() => {
    let alive = true
    if (!apiKey) {
      setBalance(null); setError(''); setLoading(false); setTime(null)
      return
    }
    setLoading(true)
    setError('')
    void fetchBalance(apiKey).then((data) => {
      if (!alive) return
      setBalance(data)
      setTime(Date.now())
      setLoading(false)
    }).catch((reason: unknown) => {
      if (!alive) return
      setBalance(null)
      setError(reason instanceof Error ? reason.message : String(reason))
      setLoading(false)
    })
    return () => { alive = false }
  }, [apiKey, refresh, meter.revision])

  const live = meter.live
  const provisional = live ? calculateCharge(
    live.model, {...live.usage, output_tokens: live.approximateOutput}, live.at
  ) : null
  const balanceText = !apiKey
    ? (zh ? '配置 API Key 后显示' : 'Set API Key to view')
    : loading && !balance ? (zh ? '正在查询…' : 'Checking…')
    : balance?.balance_infos.length
      ? balance.balance_infos.map((info) =>
          `${info.currency === 'CNY' ? '¥' : '$'}${Number(info.total_balance).toFixed(2)}`
        ).join(' / ')
      : error ? (zh ? '余额查询失败' : 'Balance unavailable')
      : (zh ? '暂无余额信息' : 'No balance info')

  return (
    <div className={styles.bar}>
      <div className={styles.summary}>
        <div className={styles.item}>
          <span className={styles.label}>{zh ? 'API 余额' : 'API balance'}</span>
          <strong title={error || undefined}>{balanceText}</strong>
          <button type="button" className={styles.iconButton}
            aria-label={zh ? '刷新账户余额' : 'Refresh API balance'}
            title={zh ? '刷新余额' : 'Refresh balance'}
            disabled={!apiKey || loading}
            onClick={() => setRefresh((n) => n + 1)}>{loading ? '…' : '↻'}</button>
        </div>
        <div className={styles.item}>
          <span className={styles.label}>{live
            ? (zh ? '生成中（预估）' : 'Generating (approx.)')
            : (zh ? '上次费用（估算）' : 'Last request (est.)')}</span>
          <strong className={styles.cost}>{live
            ? `≈${cny(provisional?.totalCny ?? 0)}`
            : meter.last ? cny(meter.last.totalCny) : '—'}</strong>
        </div>
        <div className={styles.item}>
          <span className={styles.label}>{zh ? '本机累计（估算）' : 'Local total (est.)'}</span>
          <strong>{cny(meter.totalCny)}</strong>
        </div>
        <button type="button" className={styles.expand} aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}>
          {expanded ? (zh ? '收起' : 'Less') : (zh ? '详情' : 'Details')}
        </button>
      </div>
      {expanded ? (
        <div className={styles.details}>
          <div>
            {balance ? (balance.is_available ? (zh ? '账户可用' : 'Balance available')
              : (zh ? '账户余额不足或不可用' : 'Insufficient/unavailable balance')) : ''}
            {time ? ` · ${zh ? '余额更新' : 'Updated'} ${new Date(time).toLocaleTimeString()}` : ''}
            {error ? ` · ${error}` : ''}
          </div>
          {balance?.balance_infos.map((info) => (
            <div key={info.currency}>
              {info.currency}: {zh ? '赠金' : 'Credits'} {info.granted_balance} ·
              {zh ? '充值' : 'Top-up'} {info.topped_up_balance}
            </div>
          ))}
          {meter.last ? (
            <div>
              {zh ? '最近一次：' : 'Last request: '}
              {meter.last.model} · {meter.last.tier === 'peak'
                ? (zh ? '高峰价' : 'Peak rate') : (zh ? '空闲价' : 'Off-peak rate')} ·
              {zh ? '输入未命中' : 'Input miss'} {meter.last.missed.toLocaleString()} /
              {zh ? '命中' : 'cache hit'} {meter.last.cached.toLocaleString()} /
              {zh ? '输出' : 'output'} {meter.last.output.toLocaleString()} tokens ·
              {zh ? '搜索' : 'search'} {meter.last.searches} /
              {zh ? '抓取' : 'fetch'} {meter.last.fetches} ·
              {zh ? '模型费用' : 'model'} {cny(meter.last.tokensCny)} +
              {zh ? '工具费用' : 'tools'} {cny(meter.last.toolsCny)}
            </div>
          ) : null}
          <div className={styles.note}>
            {zh
              ? `本机累计仅记录此功能启用后的 ${meter.requests} 次已返回用量的请求，不含其他设备、文件解析/OCR和语音等费用；生成中按字符粗估，完成后按服务端 Token 用量计算。实际扣费与余额以 DeepSeek 为准。`
              : `Local total covers ${meter.requests} requests since enabling this feature; excludes other devices, file/OCR and voice. Streaming values are rough, final estimates use server token usage. DeepSeek billing is authoritative.`}
            {meter.last && !meter.last.holidayKnown
              ? (zh ? ' 当前年度节假日尚未校准峰谷价格。' : ' Holiday calendar for this year is not configured.')
              : ''}
            {' '}<a href="https://api-docs.deepseek.com/zh-cn/quick_start/pricing/"
              rel="noreferrer" target="_blank">{zh ? '官方价格' : 'Official pricing'}</a>
          </div>
        </div>
      ) : null}
    </div>
  )
}
