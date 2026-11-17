#!/usr/bin/env python3
"""Replace upstream Blob URL download with Android origin-scoped document export."""
from pathlib import Path
import sys
root = Path(sys.argv[1])
file = root / 'src/components/settings/SettingsDialog.tsx'
content = file.read_text(encoding='utf-8')
old = """      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = name
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)"""
assert content.count(old) == 1, 'Upstream export changed'
content = content.replace(old, '      await saveArchive(name, blob)')
anchor = "import { useIsMobile } from '../../app/viewport.js'"
assert content.count(anchor) == 1, 'Upstream imports changed'
content = content.replace(anchor, anchor + "\nimport { saveArchive } from '../../services/chat/nativeExport.js'")
file.write_text(content, encoding='utf-8')
