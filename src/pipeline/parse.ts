import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { extractText } from 'unpdf';

export type DocFormat = 'pdf' | 'hwp' | 'hwpx' | 'html';

type ParseErrorCode = 'unsupported' | 'not_found' | 'convert_failed' | 'not_hwp' | 'empty_text';

export class ParseError extends Error {
  code: ParseErrorCode;
  exitCode?: number;
  constructor(code: ParseErrorCode, message: string, exitCode?: number) {
    super(message);
    this.name = 'ParseError';
    this.code = code;
    if (exitCode !== undefined) this.exitCode = exitCode;
  }
}

const DEFAULT_HWP2MD_CMD = 'uvx --from hwp2markdown hwp2md';
const MIN_PDF_TEXT = 200;

// hwp2md 종료 코드: 0 성공 · 1 변환 오류 · 2 파일 없음 · 3 HWP 아님/지원 안 함
const EXIT_CODE_MAP: Record<number, ParseErrorCode> = { 1: 'convert_failed', 2: 'not_found', 3: 'not_hwp' };

/** 파일 앞부분 바이트로 형식을 고른다 (확장자는 보지 않는다). */
export function detectFormat(head: Uint8Array): DocFormat {
  const b = head;
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'pdf'; // %PDF
  if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return 'hwp'; // OLE
  if (b[0] === 0x50 && b[1] === 0x4b) return 'hwpx'; // PK zip
  let i = 0;
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) i = 3; // UTF-8 BOM
  while (i < b.length && (b[i] === 0x20 || b[i] === 0x09 || b[i] === 0x0a || b[i] === 0x0d)) i++;
  if (b[i] === 0x3c) return 'html'; // <
  throw new ParseError('unsupported', 'unsupported document format');
}

function runCommand(cmd: string, args: string[]): Promise<{ code: number | null; stderr: string; spawnError?: Error }> {
  const [bin, ...pre] = cmd.trim().split(/\s+/);
  return new Promise((resolve) => {
    const child = spawn(bin, [...pre, ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => {
      stderr += String(d);
    });
    child.on('error', (err) => resolve({ code: null, stderr, spawnError: err }));
    child.on('close', (code) => resolve({ code, stderr }));
  });
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function htmlToMarkdown(html: string): string {
  const text = html
    .replace(/<(script|style|head)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi, (_m, n: string, inner: string) => {
      return `\n\n${'#'.repeat(Number(n))} ${inner.replace(/<[^>]*>/g, '').trim()}\n\n`;
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|section|article)\s*>/gi, '\n\n')
    .replace(/<li\b[^>]*>/gi, '- ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const cp = e[1] === 'x' || e[1] === 'X' ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1));
        return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    });
  const lines = text.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim());
  return `${lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()}\n`;
}

/** 문서 한 개를 Markdown 으로 바꿔 outDir/<이름>.md 에 쓴다. */
export async function parseDocument(
  path: string,
  opts?: { hwp2mdCmd?: string; outDir?: string },
): Promise<{ format: DocFormat; markdown: string; mdPath: string }> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await readFile(path));
  } catch {
    throw new ParseError('not_found', `file not found: ${path}`);
  }
  const format = detectFormat(bytes.subarray(0, 16));
  const outDir = opts?.outDir ?? (await mkdtemp(join(tmpdir(), 'pledge-parse-')));
  await mkdir(outDir, { recursive: true });
  const mdPath = join(outDir, `${basename(path, extname(path))}.md`);

  if (format === 'hwp' || format === 'hwpx') {
    const cmd = opts?.hwp2mdCmd ?? process.env.HWP2MD_CMD ?? DEFAULT_HWP2MD_CMD;
    const res = await runCommand(cmd, [path, '-o', outDir]);
    if (res.spawnError) throw new ParseError('convert_failed', `hwp2md not runnable: ${res.spawnError.message}`);
    if (res.code !== 0) {
      const exitCode = res.code ?? -1;
      throw new ParseError(
        EXIT_CODE_MAP[exitCode] ?? 'convert_failed',
        `hwp2md exited ${exitCode}: ${res.stderr.trim()}`,
        exitCode,
      );
    }
    let markdown: string;
    try {
      markdown = await readFile(mdPath, 'utf8');
    } catch {
      throw new ParseError('convert_failed', `hwp2md output missing: ${mdPath}`);
    }
    return { format, markdown, mdPath };
  }

  let markdown: string;
  if (format === 'pdf') {
    const { text } = await extractText(bytes, { mergePages: true });
    if (text.replace(/\s+/g, '').length < MIN_PDF_TEXT) {
      throw new ParseError('empty_text', `PDF text under ${MIN_PDF_TEXT} chars (scanned?): ${path}`);
    }
    markdown = `${text.trim()}\n`;
  } else {
    markdown = htmlToMarkdown(new TextDecoder().decode(bytes));
  }
  await writeFile(mdPath, markdown);
  return { format, markdown, mdPath };
}
