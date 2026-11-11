import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';

// E2E 모의 RSS 피드 서버. n8n 컨테이너에서 http://host.docker.internal:8863/feed.xml 로 읽는다.
export async function startFeedServer(opts: { file: string; port?: number }): Promise<{
  hits: string[];
  close(): Promise<void>;
}> {
  const body = readFileSync(opts.file, 'utf8');
  const hits: string[] = [];
  const server = createServer((req, res) => {
    hits.push(req.url ?? '');
    if (req.url === '/feed.xml') {
      res.writeHead(200, { 'content-type': 'application/rss+xml; charset=utf-8' });
      res.end(body);
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port ?? 8863, () => resolve());
  });
  return {
    hits,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
