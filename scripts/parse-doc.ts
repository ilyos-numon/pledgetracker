// 공약 문서(PDF·HWP·HWPX·HTML)를 Markdown 으로 바꾼다.
// 사용: node scripts/parse-doc.ts <file> --out <dir>   → 표준출력에 만든 .md 경로
import { parseArgs } from 'node:util';
import { ParseError, parseDocument } from '../src/pipeline/parse.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { out: { type: 'string' } },
});

const file = positionals[0];
if (!file || !values.out) {
  console.error('usage: node scripts/parse-doc.ts <file> --out <dir>');
  process.exit(64);
}

try {
  const res = await parseDocument(file, { outDir: values.out });
  console.log(res.mdPath);
} catch (err) {
  if (err instanceof ParseError) {
    console.error(
      `parse_error:${err.code}${err.exitCode !== undefined ? ` (exit ${err.exitCode})` : ''} ${err.message}`,
    );
    process.exit(1);
  }
  throw err;
}
