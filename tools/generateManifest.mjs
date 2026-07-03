// 広告バナー画像をスキャンして src/assetManifest.js を自動生成するツール
// 使い方:  node tools/generateManifest.mjs
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const AD_DIR_NAME = '広告バナー';
const AD_DIR = join(ROOT, AD_DIR_NAME);
const OUT = join(ROOT, 'src', 'assetManifest.js');

const EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

let files = [];
try {
  files = readdirSync(AD_DIR, { withFileTypes: true })
    .filter((d) => d.isFile() && EXTS.has(extname(d.name).toLowerCase()))
    .map((d) => d.name)
    .sort();
} catch (e) {
  console.error(`警告: ${AD_DIR} を読み取れませんでした。空のマニフェストを生成します。`);
}

const body = `// このファイルは tools/generateManifest.mjs により自動生成されます。手で編集しないでください。
// 生成日時: ${new Date().toISOString()}
export const AD_DIR = ${JSON.stringify(AD_DIR_NAME)};
export const AD_IMAGES = ${JSON.stringify(files, null, 2)};
`;

mkdirSync(join(ROOT, 'src'), { recursive: true });
writeFileSync(OUT, body, 'utf8');
console.log(`OK: ${files.length} 枚の広告画像を ${OUT} に書き出しました。`);
