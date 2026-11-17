import test from 'node:test'
import assert from 'node:assert/strict'
import {pricingPeriod, calculateCharge, approximateOutputTokens} from '../patches/billing/pricing.ts'
const utc = (date) => Date.parse(date)
test('2026 Beijing peak and off-peak boundaries', () => {
  assert.equal(pricingPeriod(utc('2026-11-17T00:59:59Z')).tier, 'offpeak')
  assert.equal(pricingPeriod(utc('2026-11-17T01:00:00Z')).tier, 'peak')
  assert.equal(pricingPeriod(utc('2026-11-17T04:00:00Z')).tier, 'offpeak')
  assert.equal(pricingPeriod(utc('2026-11-17T06:00:00Z')).tier, 'peak')
  assert.equal(pricingPeriod(utc('2026-11-17T10:00:00Z')).tier, 'offpeak')
})
test('weekends and holiday periods are off-peak', () => {
  assert.equal(pricingPeriod(utc('2026-10-02T02:00:00Z')).tier, 'offpeak')
  assert.equal(pricingPeriod(utc('2026-10-10T02:00:00Z')).tier, 'offpeak')
  assert.equal(pricingPeriod(utc('2026-05-04T02:00:00Z')).tier, 'offpeak')
})
test('Flash costs: cache discount, output tokens and billed tools', () => {
  const usage = {
    input_tokens: 1000000, cache_read_input_tokens: 500000, output_tokens: 250000,
    server_tool_use: {tool_search: 2, tool_fetch: 1, web_search_requests: 10},
  }
  const peak = calculateCharge('deepseek-flash', usage, utc('2026-11-17T02:00:00Z'))
  const off = calculateCharge('deepseek-flash', usage, utc('2026-11-17T13:00:00Z'))
  assert.equal(peak.totalCny, 4.035)
  assert.equal(off.totalCny, 2.025)
  assert.equal(peak.searches, 2)
  assert.equal(peak.fetches, 1)
})
test('Pro holiday rates and image search charge', () => {
  const data = calculateCharge('deepseek-v4-pro', {
    input_tokens: 1000000, cache_read_input_tokens: 1000000, output_tokens: 1000000,
    server_tool_use: {tool_image_search: 2},
  }, utc('2026-10-02T02:00:00Z'))
  assert.equal(Number(data.totalCny.toFixed(2)), 18.16)
})
test('unknown holiday year flagged, rough count never negative', () => {
  assert.equal(pricingPeriod(utc('2027-01-04T02:00:00Z')).holidayKnown, false)
  assert.ok(approximateOutputTokens('你好World') > 2)
  assert.equal(calculateCharge('deepseek-flash', {
    input_tokens: -1, cache_read_input_tokens: 0, output_tokens: 0,
    server_tool_use: {web_search_requests: 100},
  }, utc('2026-11-17T02:00:00Z')).totalCny, 0)
})
