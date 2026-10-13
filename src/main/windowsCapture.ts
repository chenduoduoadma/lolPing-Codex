import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { Rect } from './coords';

const run = promisify(execFile);
/** Windows GDI fallback: Chromium may omit virtual/internal displays from getSources(). */
const SCRIPT = `$ErrorActionPreference = 'Stop'
$captureRect = ConvertFrom-Json '__RECT__'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class LolPingCaptureDpi {
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
}
'@
[void][LolPingCaptureDpi]::SetProcessDpiAwarenessContext([IntPtr](-4))
[void][LolPingCaptureDpi]::SetThreadDpiAwarenessContext([IntPtr](-4))
Add-Type -AssemblyName System.Drawing
$bitmap = $null
$graphics = $null
$stream = $null
try {
  $bitmap = New-Object System.Drawing.Bitmap ([int]$captureRect[2]), ([int]$captureRect[3])
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.CopyFromScreen([int]$captureRect[0], [int]$captureRect[1], 0, 0, $bitmap.Size, [System.Drawing.CopyPixelOperation]::SourceCopy)
  $stream = New-Object System.IO.MemoryStream
  $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  [Console]::Out.Write([Convert]::ToBase64String($stream.ToArray()))
} finally {
  if ($graphics) { $graphics.Dispose() }
  if ($bitmap) { $bitmap.Dispose() }
  if ($stream) { $stream.Dispose() }
}`;

export async function captureWithWindows(rect: Rect): Promise<Buffer> {
  const values = [rect.x, rect.y, rect.width, rect.height];
  if (!values.every(Number.isSafeInteger) || rect.width <= 0 || rect.height <= 0 || rect.width * rect.height > 67108864) throw new Error('无效的屏幕截图尺寸。');
  // Only validated numbers enter the fixed script. No user text, file paths, policy changes or shell execution.
  const command = SCRIPT.replace('__RECT__', JSON.stringify(values));
  const executable = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  try {
    const { stdout } = await run(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], { windowsHide: true, timeout: 20000, maxBuffer: 32 * 1024 * 1024, encoding: 'utf8' });
    const png = Buffer.from(stdout.trim(), 'base64');
    if (png.length < 8 || png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('截图没有返回有效图片。');
    return png;
  } catch (error) {
    throw new Error(`Windows 截图失败，请重试。${error instanceof Error ? ' ' + error.message.slice(0, 180) : ''}`);
  }
}
