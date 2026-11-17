# DeepSeek Chat Demo Android（非官方）

基于 [DeepSeek 官方 chat-demo](https://github.com/deepseek-ai/chat-demo) 改造的 Android WebView APK。前端构建固定在上游 commit `5d5dd754ebc1948e977ddb880a9eb5aa25f37b4c`，本仓库保存封装和补丁。

## 下载与编译 APK

在 [GitHub Actions](https://github.com/fufuzhou/deepseek-chat-android/actions/workflows/build-apk.yml) 打开最新成功运行，下载 `DeepSeek-Chat-Demo-debug-APK` artifact，解压后安装 `app-debug.apk`。推送 main 时自动触发编译，也可手动 Run workflow。最低 Android 8.0，需较新的 Android System WebView。

## 费用统计与余额

- 在聊天界面顶部新增 **API 余额 / 上次请求费用 / 本机累计费用**，支持点击刷新、90 秒自动刷新，以及展开 Token 明细。
- 查询余额使用官方 [GET /user/balance](https://api-docs.deepseek.com/zh-cn/api/get-user-balance/)；原生 Android WebView 通过仅允许内置页面调用的专用 HTTPS 桥接向 `api.deepseek.com` 查询，避免跨域限制。API Key 仅在用户设备使用，不包含在仓库或 APK 中。
- 生成过程中按照输出字符估计 Token 并标记 `≈`。收到最后的 `message_delta.usage` 后改为按实际服务器返回的未缓存输入、缓存命中和输出 Token 计算。
- 按 [DeepSeek 模型价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)（2026-11-17）计算 Flash/Pro 模型的高峰与空闲时段人民币单价；使用 `Asia/Shanghai` 时区和 [2026 国务院节假日通知](https://www.beijing.gov.cn/zhengce/zhengcefagui/202511/t20251104_4258873.html)，不把周末调休工作日误判成高峰。未来年份如缺少假期表，将明确提示估算存在偏差。
- 仅将服务端标记为**计费次数**的 `server_tool_use.tool_search`、`tool_image_search` 和 `tool_fetch` 按 ¥0.005/次纳入；不会把用于显示的 `web_search_requests` 当成额外计费。
- 本机累计只统计启用该功能后、服务器已返回用量的本 App 请求；按 API Key SHA-256 摘要隔离本地账本，不存储明文 Key 于费用数据中。不代表账户总体消费，重装/清数据会清空账本。
- **费用为估算，非官方账单**。语音、文件解析/OCR 等额外服务费用暂未纳入；峰谷表及促销价格可能变化，实际扣款以官方余额和账单为准。余额查询失败时明确显示失败，不用本地估计代替真实余额。

## 本地构建

需要 Node.js 22、pnpm、Git、Python 3、JDK 17、Android SDK API 35 和 Gradle 8.10.2：

```bash
bash scripts/build-web.sh
gradle :app:assembleDebug --no-daemon
```

构建输出：`app/build/outputs/apk/debug/app-debug.apk`。

## 隐私与许可证

仍沿用原版浏览器 localStorage 存放 API Key、IndexedDB 存放聊天记录的设计；设置里可清除本地历史。不要向 GitHub 上传密钥。上游使用 MIT 许可证，详见打包的 `dist/LICENSE`；项目不是 DeepSeek 官方产品。
