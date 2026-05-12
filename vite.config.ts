import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

type ConnectorSecret = {
  tokenHash: string;
  tokenPreview: string;
  createdAt: string | null;
  rotatedAt: string | null;
};

type ConnectorExtras = {
  intelNotes: unknown[];
  financeScenarios: unknown[];
  trackedBrands: unknown[];
  companyProfiles: unknown[];
  ideas: unknown[];
  founders: unknown[];
  founderPodcasts: unknown[];
  podcastEpisodes: unknown[];
  updatedAt: string | null;
};

const CATEGORIES_FILE = path.resolve(__dirname, 'categories.json');
const BRAIN_FILE = path.resolve(__dirname, 'brain.json');
const CONVERSATIONS_FILE = path.resolve(__dirname, 'conversations.json');
const CONNECTOR_SECRET_FILE = path.resolve(__dirname, 'chatgpt-connector-secret.json');
const CONNECTOR_EXTRAS_FILE = path.resolve(__dirname, 'chatgpt-connector-extras.json');

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf-8').trim();
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonFileAtomic(filePath: string, value: unknown): void {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf-8');
  fs.renameSync(tmp, filePath);
}

function emptyConnectorSecret(): ConnectorSecret {
  return {
    tokenHash: '',
    tokenPreview: '',
    createdAt: null,
    rotatedAt: null,
  };
}

function emptyConnectorExtras(): ConnectorExtras {
  return {
    intelNotes: [],
    financeScenarios: [],
    trackedBrands: [],
    companyProfiles: [],
    ideas: [],
    founders: [],
    founderPodcasts: [],
    podcastEpisodes: [],
    updatedAt: null,
  };
}

function getForwardedHeader(req: any, key: string): string | undefined {
  const value = req.headers[key];
  if (Array.isArray(value)) return value[0];
  if (typeof value === 'string') return value.split(',')[0].trim();
  return undefined;
}

function getRequestOrigin(req: any): string {
  const proto = getForwardedHeader(req, 'x-forwarded-proto') || 'http';
  const host = getForwardedHeader(req, 'x-forwarded-host') || req.headers.host || 'localhost:5173';
  return `${proto}://${host}`;
}

function isLocalOrigin(origin: string): boolean {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(origin);
}

function isSameOriginRequest(req: any): boolean {
  const origin = req.headers.origin;
  if (!origin || typeof origin !== 'string') return true;
  return origin === getRequestOrigin(req);
}

function setPublicCors(res: any): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

function sendJson(res: any, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function normalizeArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getConnectorSecret(): ConnectorSecret {
  return readJsonFile(CONNECTOR_SECRET_FILE, emptyConnectorSecret());
}

function getConnectorMetadata(req: any) {
  const secret = getConnectorSecret();
  const origin = getRequestOrigin(req);
  return {
    configured: !!secret.tokenHash,
    tokenPreview: secret.tokenPreview || null,
    createdAt: secret.createdAt,
    rotatedAt: secret.rotatedAt,
    apiBaseUrl: `${origin}/api/chatgpt`,
    openApiUrl: `${origin}/api/chatgpt/openapi.json`,
    snapshotUrl: `${origin}/api/chatgpt/snapshot`,
    requiresPublicHttps: !origin.startsWith('https://') || isLocalOrigin(origin),
  };
}

function createConnectorToken(): string {
  return `ffa_ro_${crypto.randomBytes(24).toString('base64url')}`;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function parseBearerToken(req: any): string | null {
  const auth = req.headers.authorization;
  if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7).trim() || null;
}

function requireConnectorAuth(req: any, res: any): boolean {
  const secret = getConnectorSecret();
  if (!secret.tokenHash) {
    sendJson(res, 503, { error: 'ChatGPT connector token not configured yet.' });
    return false;
  }

  const token = parseBearerToken(req);
  if (!token || hashToken(token) !== secret.tokenHash) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return false;
  }
  return true;
}

function readConnectorExtras(): ConnectorExtras {
  const parsed = readJsonFile(CONNECTOR_EXTRAS_FILE, emptyConnectorExtras());
  return {
    intelNotes: normalizeArray(parsed.intelNotes),
    financeScenarios: normalizeArray(parsed.financeScenarios),
    trackedBrands: normalizeArray(parsed.trackedBrands),
    companyProfiles: normalizeArray(parsed.companyProfiles),
    ideas: normalizeArray(parsed.ideas),
    founders: normalizeArray(parsed.founders),
    founderPodcasts: normalizeArray(parsed.founderPodcasts),
    podcastEpisodes: normalizeArray(parsed.podcastEpisodes),
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
  };
}

function buildConnectorSnapshot() {
  const categories = normalizeArray(readJsonFile(CATEGORIES_FILE, [] as unknown[]));
  const brainEntries = normalizeArray(readJsonFile(BRAIN_FILE, [] as unknown[]));
  const conversations = normalizeArray(readJsonFile(CONVERSATIONS_FILE, [] as unknown[]));
  const extras = readConnectorExtras();
  return {
    generatedAt: new Date().toISOString(),
    categories,
    brainEntries,
    conversations,
    intelNotes: extras.intelNotes,
    financeScenarios: extras.financeScenarios,
    trackedBrands: extras.trackedBrands,
    companyProfiles: extras.companyProfiles,
    ideas: extras.ideas,
    founders: extras.founders,
    founderPodcasts: extras.founderPodcasts,
    podcastEpisodes: extras.podcastEpisodes,
    counts: {
      categories: categories.length,
      brainEntries: brainEntries.length,
      conversations: conversations.length,
      intelNotes: extras.intelNotes.length,
      financeScenarios: extras.financeScenarios.length,
      trackedBrands: extras.trackedBrands.length,
      companyProfiles: extras.companyProfiles.length,
      ideas: extras.ideas.length,
      founders: extras.founders.length,
      founderPodcasts: extras.founderPodcasts.length,
      podcastEpisodes: extras.podcastEpisodes.length,
    },
    extrasUpdatedAt: extras.updatedAt,
  };
}

function buildConnectorOpenApi(req: any) {
  const origin = getRequestOrigin(req);
  return {
    openapi: '3.1.0',
    info: {
      title: 'FlashFace ChatGPT Connector',
      version: '1.0.0',
      description: 'Read-only API for ChatGPT Actions to pull the latest FlashFace portfolio, brain, and operational datasets.',
    },
    servers: [{ url: origin }],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'API Key',
        },
      },
      schemas: {
        JsonArray: {
          type: 'array',
          items: { type: 'object', additionalProperties: true },
        },
        Snapshot: {
          type: 'object',
          additionalProperties: true,
        },
      },
    },
    security: [{ BearerAuth: [] }],
    paths: {
      '/api/chatgpt/snapshot': {
        get: {
          operationId: 'getFlashFaceSnapshot',
          summary: 'Get the full FlashFace snapshot',
          description: 'Returns categories, brain entries, saved conversations, and browser-synced operational datasets in one payload.',
          responses: {
            '200': {
              description: 'Full FlashFace snapshot',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Snapshot' },
                },
              },
            },
          },
        },
      },
      '/api/chatgpt/categories': {
        get: {
          operationId: 'getFlashFaceCategories',
          summary: 'Get all categories',
          responses: {
            '200': {
              description: 'Array of category records',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/JsonArray' },
                },
              },
            },
          },
        },
      },
      '/api/chatgpt/brain': {
        get: {
          operationId: 'getFlashFaceBrain',
          summary: 'Get Brain OS entries',
          responses: {
            '200': {
              description: 'Array of brain entries',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/JsonArray' },
                },
              },
            },
          },
        },
      },
      '/api/chatgpt/conversations': {
        get: {
          operationId: 'getFlashFaceConversations',
          summary: 'Get saved GPT conversations',
          responses: {
            '200': {
              description: 'Array of conversation records',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/JsonArray' },
                },
              },
            },
          },
        },
      },
      '/api/chatgpt/extras': {
        get: {
          operationId: 'getFlashFaceExtras',
          summary: 'Get browser-synced operational datasets',
          description: 'Returns intel notes, finance scenarios, tracked brands, ideas, founders, and podcast datasets synced from the app browser to the connector.',
          responses: {
            '200': {
              description: 'Connector extras object',
              content: {
                'application/json': {
                  schema: { type: 'object', additionalProperties: true },
                },
              },
            },
          },
        },
      },
    },
  };
}

function chatgptConnectorPlugin() {
  return {
    name: 'chatgpt-connector',
    configureServer(server: any) {
      server.middlewares.use('/api/chatgpt', (req: any, res: any) => {
        const route = (req.url || '/').split('?')[0] || '/';
        const isPublicGetRoute = ['/openapi.json', '/snapshot', '/categories', '/brain', '/conversations', '/extras'].includes(route);

        if (req.method === 'OPTIONS') {
          if (isPublicGetRoute) setPublicCors(res);
          res.statusCode = 204;
          res.end();
          return;
        }

        if (route === '/openapi.json' && req.method === 'GET') {
          setPublicCors(res);
          sendJson(res, 200, buildConnectorOpenApi(req));
          return;
        }

        if (route === '/status' && req.method === 'GET') {
          if (!isSameOriginRequest(req)) {
            sendJson(res, 403, { error: 'Forbidden' });
            return;
          }
          sendJson(res, 200, getConnectorMetadata(req));
          return;
        }

        if (route === '/token/rotate' && req.method === 'POST') {
          if (!isSameOriginRequest(req)) {
            sendJson(res, 403, { error: 'Forbidden' });
            return;
          }

          const token = createConnectorToken();
          const now = new Date().toISOString();
          const nextSecret: ConnectorSecret = {
            tokenHash: hashToken(token),
            tokenPreview: `${token.slice(0, 7)}...${token.slice(-4)}`,
            createdAt: getConnectorSecret().createdAt || now,
            rotatedAt: now,
          };
          writeJsonFileAtomic(CONNECTOR_SECRET_FILE, nextSecret);
          sendJson(res, 200, { ...getConnectorMetadata(req), token });
          return;
        }

        if (route === '/extras' && req.method === 'POST') {
          if (!isSameOriginRequest(req)) {
            sendJson(res, 403, { error: 'Forbidden' });
            return;
          }

          let body = '';
          req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          req.on('end', () => {
            try {
              const parsed = body ? JSON.parse(body) : {};
              const nextExtras: ConnectorExtras = {
                intelNotes: normalizeArray(parsed.intelNotes),
                financeScenarios: normalizeArray(parsed.financeScenarios),
                trackedBrands: normalizeArray(parsed.trackedBrands),
                companyProfiles: normalizeArray(parsed.companyProfiles),
                ideas: normalizeArray(parsed.ideas),
                founders: normalizeArray(parsed.founders),
                founderPodcasts: normalizeArray(parsed.founderPodcasts),
                podcastEpisodes: normalizeArray(parsed.podcastEpisodes),
                updatedAt: new Date().toISOString(),
              };
              writeJsonFileAtomic(CONNECTOR_EXTRAS_FILE, nextExtras);
              sendJson(res, 200, { ok: true, updatedAt: nextExtras.updatedAt });
            } catch (e) {
              sendJson(res, 400, { error: String(e) });
            }
          });
          return;
        }

        if (isPublicGetRoute && req.method === 'GET') {
          setPublicCors(res);
          if (!requireConnectorAuth(req, res)) return;

          const snapshot = buildConnectorSnapshot();
          if (route === '/snapshot') {
            sendJson(res, 200, snapshot);
            return;
          }
          if (route === '/categories') {
            sendJson(res, 200, snapshot.categories);
            return;
          }
          if (route === '/brain') {
            sendJson(res, 200, snapshot.brainEntries);
            return;
          }
          if (route === '/conversations') {
            sendJson(res, 200, snapshot.conversations);
            return;
          }
          if (route === '/extras') {
            sendJson(res, 200, {
              intelNotes: snapshot.intelNotes,
              financeScenarios: snapshot.financeScenarios,
              trackedBrands: snapshot.trackedBrands,
              companyProfiles: snapshot.companyProfiles,
              ideas: snapshot.ideas,
              founders: snapshot.founders,
              founderPodcasts: snapshot.founderPodcasts,
              podcastEpisodes: snapshot.podcastEpisodes,
              updatedAt: snapshot.extrasUpdatedAt,
            });
            return;
          }
        }

        sendJson(res, 405, { error: 'Method not allowed' });
      });
    },
  };
}

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
    plugins: [react(), tailwindcss(), categoriesPersistencePlugin(), jsonFilePersistencePlugin('/api/brain', 'brain.json'), jsonFilePersistencePlugin('/api/conversations', 'conversations.json'), chatgptConnectorPlugin()],
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
