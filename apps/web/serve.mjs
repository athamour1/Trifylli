/**
 * Ελάχιστος στατικός server για την χτισμένη PWA.
 *
 * Το `quasar serve` απαιτεί το ομώνυμο app extension· εδώ χρειαζόμαστε μόνο
 * στατικά αρχεία με SPA fallback (vueRouterMode: 'history'), οπότε δεν αξίζει
 * η εξάρτηση. Για production χρησιμοποιείται nginx (βλ. apps/web/Dockerfile).
 *
 *   node serve.mjs [port]
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, 'dist/pwa');
const PORT = Number(process.argv[2] ?? process.env.PORT ?? 9000);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  // `normalize` + έλεγχος προθέματος: χωρίς αυτό ένα `../` στο path θα διάβαζε
  // αρχεία έξω από τον φάκελο διανομής.
  const target = resolve(join(ROOT, normalize(decodeURIComponent(url.pathname))));

  const file =
    target.startsWith(ROOT) && existsSync(target) && statSync(target).isFile()
      ? target
      : join(ROOT, 'index.html');

  res.writeHead(200, {
    'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
    // Ο service worker δεν πρέπει να μένει στην cache του browser, αλλιώς δεν
    // φτάνει ποτέ νέα έκδοση.
    'Cache-Control': file.endsWith('sw.js') ? 'no-cache' : 'public, max-age=3600',
  });
  createReadStream(file).pipe(res);
});

server.listen(PORT, () => {
  console.log(`PWA: http://localhost:${PORT}`);
});
