# Codex 功能说明

使用方法和其他电脑的安装条件见 [README.md](README.md)。

该改版通过本机 `codex exec --json` 接入，复用当前用户的 Codex 登录与配置。问题经 stdin 传入；附图使用 `--image`，参数明确分隔，不把用户文本拼接成 shell 命令。

默认 `read-only`，用户允许改文件时为 `workspace-write`。额外权限不会自动批准。输入框关闭时隐藏窗口，任务可继续；“停止任务”会终止当前任务及其子进程。

屏幕选择依据原始手势坐标转换到 Electron 的 DIP 坐标，也支持手动选屏。捕获图片与所选显示器 ID 严格对应；Windows 枚举遗漏主屏时使用 DPI 感知的原生 GDI 捕获。裁剪坐标按实际图片尺寸换算，支持 125% 等显示缩放。

开发者窗口 QA 使用合成图片。`tools/dual-display-qa.ts` 会短暂显示纯色测试窗口，用真实显示器验证来源与裁剪，不保存用户桌面图片、不调用模型；`tools/codex-smoke.ts` 使用合成图片做临时 Codex 会话连接测试。QA 输出不进入源码或安装包。
