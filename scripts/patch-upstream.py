#!/usr/bin/env python3
"""Patch pinned official DeepSeek chat-demo for Android history export and billing UI."""
from pathlib import Path
import sys

root = Path(sys.argv[1])

def replace_once(path: str, old: str, new: str) -> None:
    file = root / path
    content = file.read_text(encoding='utf-8')
    assert content.count(old) == 1, f"Upstream changed: {path}: {old[:70]!r}"
    file.write_text(content.replace(old, new), encoding='utf-8')

replace_once('src/components/settings/SettingsDialog.tsx', """      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = name
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)""", "      await saveArchive(name, blob)")
replace_once('src/components/settings/SettingsDialog.tsx',
    "import { useIsMobile } from '../../app/viewport.js'",
    "import { useIsMobile } from '../../app/viewport.js'\n"
    "import { saveArchive } from '../../services/chat/nativeExport.js'")

replace_once('src/app/App.tsx',
    "import styles from './App.module.css'",
    "import { BillingBar } from '../components/billing/BillingBar.js'\n"
    "import styles from './App.module.css'")
replace_once('src/app/App.tsx',
    "          <div className={styles.content}>",
    "          <BillingBar />\n          <div className={styles.content}>")

# The API's final message_delta usage is per HTTP request, not the entire
# persisted assistant message (which may be regenerated/resumed).
replace_once('src/services/api/client.ts',
    "import { translate, type TranslationMessage } from '../../i18n/index.js'",
    "import { translate, type TranslationMessage } from '../../i18n/index.js'\n"
    "import { startCharge, addChargeDelta, finishCharge, stopCharge } from '../billing/meter.js'")
replace_once('src/services/api/client.ts',
    "  const response = await request(`${ANTHROPIC_BASE_URL}/messages`, {",
    "  const billingStartedAt = Date.now()\n"
    "  let billingId: string | null = null\n"
    "  let billingModel: string = body.model\n"
    "  let billed = false\n"
    "  const response = await request(`${ANTHROPIC_BASE_URL}/messages`, {")
replace_once('src/services/api/client.ts',
    "  for await (const { event: eventName, data } of readServerSentEvents(response.body, signal)) {",
    "  try {\n"
    "  for await (const { event: eventName, data } of readServerSentEvents(response.body, signal)) {")
replace_once('src/services/api/client.ts',
    """    yield event
    if (event.type === 'message_stop') {""",
    """    if (event.type === 'message_start') {
      billingId = event.message.id || crypto.randomUUID()
      billingModel = event.message.model || body.model
      startCharge(billingId, billingModel, event.message.usage, billingStartedAt)
    } else if (event.type === 'content_block_delta' && billingId) {
      const delta = event.delta
      if (delta.type === 'text_delta' || delta.type === 'thinking_delta')
        addChargeDelta(billingId, delta.type === 'text_delta' ? delta.text : delta.thinking)
    } else if (event.type === 'message_delta' && event.usage && billingId && !billed) {
      billed = true
      finishCharge(apiKey, billingId, billingModel, event.usage, billingStartedAt)
    }
    yield event
    if (event.type === 'message_stop') {""")
replace_once('src/services/api/client.ts',
    """  }
  // 服务端没有提供错误内容时保持为空，不推测断流原因。""",
    """  }
  } finally {
    if (billingId) stopCharge(billingId)
  }
  // 服务端没有提供错误内容时保持为空，不推测断流原因。""")
