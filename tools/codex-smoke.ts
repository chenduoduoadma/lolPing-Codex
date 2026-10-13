import { CodexRunner } from '../src/main/codexRunner';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const updates: unknown[] = [];
const runner = new CodexRunner();
await runner.run({ workspace: process.cwd(), allowChanges: false, ephemeral: true, image: join(process.cwd(), 'qa-output', 'test-image.png'), question: '这是连接测试。只读取附图，不调用工具，不读写文件。请返回图片里四位数字，以及“连接成功”。' }, (update) => { updates.push(update); if (update.reply) console.log(update.reply); });
await writeFile('qa-output/live-codex-result.json', JSON.stringify({ completed: true, updates }, null, 2));
