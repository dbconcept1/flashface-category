import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

/**
 * Vite dev-server plugin that persists categories to disk.
 * GET  /api/categories  → reads categories.json
 * POST /api/categories  → writes categories.json (atomic via temp file rename)
 * The file lives at the workspace root so it survives all browser-side storage clearing,
 * incognito mode, origin changes, and port-forwarding URL changes in Codespaces.
 */
function categoriesPersistencePlugin() {
  const DATA_FILE = path.resolve(__dirname, 'categories.json');
  return {
    name: 'categories-persistence',
    configureServer(server: any) {
      server.middlewares.use('/api/categories', (req: any, res: any) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }

        if (req.method === 'GET') {
          try {
            const data = fs.existsSync(DATA_FILE) ? fs.readFileSync(DATA_FILE, 'utf-8') : '[]';
            res.setHeader('Content-Type', 'application/json');
            res.end(data);
          } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: String(e) }));
          }
          return;
        }

        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          req.on('end', () => {
            try {
              // Validate: must be a valid JSON array before writing
              const parsed = JSON.parse(body);
              if (!Array.isArray(parsed)) throw new Error('Expected array');
              // Atomic write: write to temp file, then rename
              const tmp = DATA_FILE + '.tmp';
              fs.writeFileSync(tmp, JSON.stringify(parsed, null, 2), 'utf-8');
              fs.renameSync(tmp, DATA_FILE);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true, count: parsed.length }));
            } catch (e) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: String(e) }));
            }
          });
          return;
        }

        res.statusCode = 405;
        res.end();
      });
    },
  };
}

/**
 * Generic JSON file persistence plugin.
 * Serves GET/POST for an array of objects at a given API path.
 * Used for brain.json and conversations.json, mirroring categories.json.
 */
function jsonFilePersistencePlugin(apiPath: string, fileName: string) {
  const DATA_FILE = path.resolve(__dirname, fileName);
  return {
    name: `json-persistence:${fileName}`,
    configureServer(server: any) {
      server.middlewares.use(apiPath, (req: any, res: any) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

        if (req.method === 'GET') {
          try {
            const data = fs.existsSync(DATA_FILE) ? fs.readFileSync(DATA_FILE, 'utf-8') : '[]';
            res.setHeader('Content-Type', 'application/json');
            res.end(data);
          } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: String(e) })); }
          return;
        }

        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          req.on('end', () => {
            try {
              const parsed = JSON.parse(body);
              if (!Array.isArray(parsed)) throw new Error('Expected array');
              const tmp = DATA_FILE + '.tmp';
              fs.writeFileSync(tmp, JSON.stringify(parsed, null, 2), 'utf-8');
              fs.renameSync(tmp, DATA_FILE);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true, count: parsed.length }));
            } catch (e) { res.statusCode = 400; res.end(JSON.stringify({ error: String(e) })); }
          });
          return;
        }

        res.statusCode = 405; res.end();
      });
    },
  };
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss(), categoriesPersistencePlugin(), jsonFilePersistencePlugin('/api/brain', 'brain.json'), jsonFilePersistencePlugin('/api/conversations', 'conversations.json')],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',      watch: {
        // Ignore categories.json so Vite doesn't reload the page when the
        // persistence layer writes category updates during AI research.
        ignored: ['**/categories.json', '**/categories.json.tmp', '**/brain.json', '**/brain.json.tmp', '**/conversations.json', '**/conversations.json.tmp'],
      },    },
  };
});
