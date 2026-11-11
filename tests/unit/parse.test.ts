import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { detectFormat, ParseError, parseDocument } from '../../src/pipeline/parse.ts';

// 가짜 hwp2md: 받은 인자를 기록하고, FAKE_HWP2MD_EXIT 가 0 이 아니면 그 코드로 끝난다.
const FAKE_SCRIPT = `
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
const args = process.argv.slice(2);
writeFileSync(process.env.FAKE_HWP2MD_LOG, JSON.stringify(args));
const code = Number(process.env.FAKE_HWP2MD_EXIT ?? '0');
if (code !== 0) { process.stderr.write('fake failure'); process.exit(code); }
const input = args[0];
const out = args[args.indexOf('-o') + 1];
mkdirSync(out, { recursive: true });
writeFileSync(join(out, basename(input, extname(input)) + '.md'), '# 가짜 변환\\n\\n공약 본문\\n');
`;

let dir: string;
let fakeCmd: string;
let logPath: string;

function file(name: string, bytes: Uint8Array | string): string {
  const p = join(dir, name);
  writeFileSync(p, bytes);
  return p;
}

// 텍스트 한 줄짜리 최소 PDF (Helvetica, ASCII). unpdf 가 읽을 수 있는 실제 PDF 바이트.
function minimalPdf(text: string): Uint8Array {
  const stream = `BT /F1 10 Tf 20 700 Td (${text}) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 2000 800] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) body += `${String(off).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'parse-test-'));
  logPath = join(dir, 'args.json');
  fakeCmd = `node ${file('fake-hwp2md.mjs', FAKE_SCRIPT)}`;
  process.env.FAKE_HWP2MD_LOG = logPath;
});

describe('detectFormat', () => {
  it('바이트로 형식을 고른다', () => {
    expect(detectFormat(new TextEncoder().encode('%PDF-1.7'))).toBe('pdf');
    expect(detectFormat(Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1]))).toBe('hwp');
    expect(detectFormat(Uint8Array.from([0x50, 0x4b, 0x03, 0x04]))).toBe('hwpx');
    expect(detectFormat(new TextEncoder().encode('<!doctype html>'))).toBe('html');
    expect(detectFormat(new TextEncoder().encode('﻿\n  <html>'))).toBe('html');
  });

  it('맞는 형식이 없으면 unsupported', () => {
    try {
      detectFormat(new TextEncoder().encode('hello world'));
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ParseError);
      expect((e as ParseError).code).toBe('unsupported');
    }
  });
});

describe('parseDocument — hwp2md CLI', () => {
  it('확장자가 아니라 바이트로 판별해 hwp2md 를 <file> -o <outDir> 로 부른다', async () => {
    process.env.FAKE_HWP2MD_EXIT = '0';
    const src = file('공약집.pdf', Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0, 0]));
    const outDir = join(dir, 'out1');
    const res = await parseDocument(src, { hwp2mdCmd: fakeCmd, outDir });
    expect(JSON.parse(readFileSync(logPath, 'utf8'))).toEqual([src, '-o', outDir]);
    expect(res.format).toBe('hwpx');
    expect(res.mdPath).toBe(join(outDir, '공약집.md'));
    expect(res.markdown).toContain('공약 본문');
  });

  it('HWP2MD_CMD 환경변수를 쓴다', async () => {
    process.env.FAKE_HWP2MD_EXIT = '0';
    process.env.HWP2MD_CMD = fakeCmd;
    try {
      const src = file('a.hwp', Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
      const res = await parseDocument(src, { outDir: join(dir, 'out2') });
      expect(res.format).toBe('hwp');
      expect(JSON.parse(readFileSync(logPath, 'utf8'))[0]).toBe(src);
    } finally {
      delete process.env.HWP2MD_CMD;
    }
  });

  it.each([
    [1, 'convert_failed'],
    [2, 'not_found'],
    [3, 'not_hwp'],
    [7, 'convert_failed'],
  ] as const)('종료 코드 %i → %s', async (exit, code) => {
    process.env.FAKE_HWP2MD_EXIT = String(exit);
    const src = file(`e${exit}.hwpx`, Uint8Array.from([0x50, 0x4b, 0x03, 0x04]));
    const err = await parseDocument(src, { hwp2mdCmd: fakeCmd, outDir: join(dir, `err${exit}`) }).catch((e) => e);
    expect(err).toBeInstanceOf(ParseError);
    expect(err.code).toBe(code);
    expect(err.exitCode).toBe(exit);
  });

  it('명령을 실행할 수 없으면 convert_failed', async () => {
    const src = file('x.hwpx', Uint8Array.from([0x50, 0x4b, 0x03, 0x04]));
    const err = await parseDocument(src, { hwp2mdCmd: join(dir, 'no-such-binary'), outDir: join(dir, 'o3') }).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(ParseError);
    expect(err.code).toBe('convert_failed');
  });
});

describe('parseDocument — 기타 형식', () => {
  it('없는 파일은 not_found', async () => {
    const err = await parseDocument(join(dir, 'missing.pdf')).catch((e) => e);
    expect(err).toBeInstanceOf(ParseError);
    expect(err.code).toBe('not_found');
  });

  it('알 수 없는 바이트는 unsupported', async () => {
    const err = await parseDocument(file('junk.pdf', 'just text')).catch((e) => e);
    expect(err).toBeInstanceOf(ParseError);
    expect(err.code).toBe('unsupported');
  });

  it('PDF 는 unpdf 로 텍스트를 꺼내 .md 로 쓴다', async () => {
    const text = 'Pledge one: build a transfer parking lot near the station. '.repeat(5);
    const src = file('doc.bin', minimalPdf(text));
    const outDir = join(dir, 'pdf-out');
    const res = await parseDocument(src, { outDir });
    expect(res.format).toBe('pdf');
    expect(res.mdPath).toBe(join(outDir, 'doc.md'));
    expect(res.markdown).toContain('transfer parking lot');
    expect(readFileSync(res.mdPath, 'utf8')).toBe(res.markdown);
  });

  it('PDF 텍스트가 200자 미만이면 empty_text (스캔본)', async () => {
    const src = file('scan.pdf', minimalPdf('short'));
    const err = await parseDocument(src, { outDir: join(dir, 'scan-out') }).catch((e) => e);
    expect(err).toBeInstanceOf(ParseError);
    expect(err.code).toBe('empty_text');
  });

  it('HTML 은 제목을 # 으로, 태그를 지운 텍스트로', async () => {
    const html =
      '<!doctype html><html><head><title>t</title><style>p{color:red}</style></head><body>' +
      '<h1>OO시 공약</h1><h2>교통</h2><p>OO역 환승주차장 건립 &amp; 운영</p><script>alert(1)</script></body></html>';
    const res = await parseDocument(file('page.html', html), { outDir: join(dir, 'html-out') });
    expect(res.format).toBe('html');
    expect(res.markdown).toContain('# OO시 공약');
    expect(res.markdown).toContain('## 교통');
    expect(res.markdown).toContain('OO역 환승주차장 건립 & 운영');
    expect(res.markdown).not.toContain('<');
    expect(res.markdown).not.toContain('alert');
    expect(res.markdown).not.toContain('color:red');
  });
});
