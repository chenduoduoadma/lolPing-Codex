# lolPing Codex

在 Windows 桌面发一个“请求协助”信号，框选截图、输入问题，确认后交给本机 Codex 处理。

基于 [darrenprx/lolPing](https://github.com/darrenprx/lolPing) v0.5.1 的社区改版。保留原版信号、声音、表情和房间功能，新增 Codex 提问入口。原作者 Danrui Meng；原始代码采用 MIT 许可证，详见 [LICENSE](LICENSE) 和 [NOTICE.md](NOTICE.md)。

## 下载与安装

从 [Releases](https://github.com/chenduoduoadma/lolPing-Codex/releases) 下载 `lolPing-Codex-Setup-0.6.0.exe`，运行安装。安装包包含运行时与输入辅助程序，不需要自行安装 Node.js。

- Windows 10/11，64 位。本版本已在 Windows 10 的 125%／100% 双屏环境验证。
- 安装包尚未代码签名；Windows 可能显示 SmartScreen 提示。
- 以 **lolPing Codex** 独立安装，使用独立设置目录。使用时请退出其他版本的 lolPing，避免两套全局信号快捷键同时运行。
- **截图提问需要额外安装并登录 Codex，并具备可用额度与网络连接。** 本安装包不包含 Codex、不包含 API 密钥或任何账号凭据。仅截图和预览不需要登录 Codex。

## 使用

1. 按住 **Alt**，向轮盘下方的“请求协助”方向拖动并松开。也可右键托盘图标，选择“请求 Codex 协助…”。
2. 在输入框里说明问题。
3. 用“截图屏幕”下拉框确认主屏或副屏，点击 **框选截图区域**，拖动鼠标，松开后预览裁剪结果。**Esc 或右键取消**。也可截取整块屏幕。
4. 选择实际需要检查的工作文件夹。默认使用当前电脑的文档目录，失效的旧路径会自动回退。
5. 点击 **确认并交给 Codex**。回复显示在窗口内，可停止任务或在 Codex 中打开。

默认只分析。勾选“允许 Codex 修改所选工作文件夹中的文件”才开放该文件夹的修改权限。后台请求不自动获取额外权限，也不关闭沙盒。

发信号默认跟随手势所在屏幕；可手动选屏。换屏时会清除旧截图，避免误提交另一块屏幕的旧画面。Windows 截图库漏掉某块显示器时，会通过原生截图通道捕获所选屏幕。

程序自动查找桌面版 Codex 或常见 CLI 安装位置。如果没有找到，可点击 **选择 Codex 程序**，选择 `codex.exe`，并确保它已登录。每次提交产生一个独立的 Codex 任务，不自动继承其他聊天历史。

## 数据与更新

- 信号只打开输入框，不自动截图，不自动发起模型请求。
- 未提交的截图保留在应用内存中；确认提交时才发送到 Codex，区域截图只发送裁剪结果。
- 设置保存在 `%APPDATA%\lolPing Codex\`；已提交截图保存在其中的 `codex-requests` 子目录。
- 本改版关闭了原项目的更新入口，避免原版安装器覆盖这些功能；更新请从本仓库 Releases 获取。

## 从源码构建

需要 Node.js 22.12 或更高版本，以及 Visual Studio 2022 或更高版本的“使用 C++ 的桌面开发”工作负载。

```powershell
npm ci
npm run build:helper
npm run typecheck
npm exec -- vitest run --maxWorkers=2
npm run dist
```

安装包生成在 `release/`。仓库提供 Windows CI 和手动 Release 工作流。

`tools/build-installer.cjs` 是可选的本地缓存构建入口，需要准备好 Electron 运行时目录和已构建的 `hook-helper.exe`；标准源码构建不依赖该入口。

## 验证与来源

测试覆盖区域裁剪、显示缩放、Codex 参数传递、路径发现和任务取消。还在两块实际显示器上验证了捕获来源、原生主屏回退、手动选屏、框选窗口位置与裁剪像素；图片提问连接使用合成图片验证。

原始文档保存在 [UPSTREAM_README.md](UPSTREAM_README.md) 和 [UPSTREAM_README.zh-CN.md](UPSTREAM_README.zh-CN.md)。信号及表情素材版权属于 Riot Games，不属于代码的 MIT 许可证范围。本项目不由 Riot Games、OpenAI 或原作者背书。
