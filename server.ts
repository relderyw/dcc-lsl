import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import * as XLSX from "xlsx";

dotenv.config();

const RECORDS_KEY = 'picking_shared_data';
const LAYOUT_KEY = 'picking_layout_data';

// ─── Cloud URL for proxying ──────────────────────────────────────────────────
// If CLOUD_URL is set, all /api/sync requests are proxied to the cloud
// This avoids needing Redis credentials locally.
const CLOUD_URL = process.env.CLOUD_URL?.replace(/\/$/, ''); // e.g. https://picking-xxx.vercel.app

// ─── Redis Connection ────────────────────────────────────────────────────────
let redisClient: any = null;

async function getRedisClient() {
  if (redisClient) return redisClient;

  if (process.env.REDIS_URL) {
    const IORedis = (await import('ioredis')).default;
    redisClient = new IORedis(process.env.REDIS_URL, { lazyConnect: true });
    redisClient._type = 'ioredis';
    return redisClient;
  }

  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    const { Redis } = await import('@upstash/redis');
    redisClient = new Redis({ url, token });
    redisClient._type = 'upstash';
    return redisClient;
  }

  return null;
}

// ─── In-memory fallback ──────────────────────────────────────────────────────
let memoryStore = { records: [] as any[], bays: [] as any[] };

async function redisGet(key: string): Promise<any> {
  const client = await getRedisClient();
  if (!client) return null;
  const val = await client.get(key);
  if (typeof val === 'string') return JSON.parse(val);
  return val;
}

async function redisSet(key: string, value: any) {
  const client = await getRedisClient();
  if (!client) return;
  await client.set(key, JSON.stringify(value));
}

// ─── Proxy to Cloud ───────────────────────────────────────────────────────────
async function cloudGet(): Promise<{ records: any[]; bays: any[] } | null> {
  if (!CLOUD_URL) return null;
  try {
    const res = await fetch(`${CLOUD_URL}/api/sync`);
    if (!res.ok) throw new Error(`Cloud returned ${res.status}`);
    return await res.json();
  } catch (e: any) {
    console.error('[Proxy] GET from cloud failed:', e.message);
    return null;
  }
}

async function cloudPost(body: { records?: any[]; bays?: any[] }): Promise<boolean> {
  if (!CLOUD_URL) return false;
  try {
    const res = await fetch(`${CLOUD_URL}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return res.ok;
  } catch (e: any) {
    console.error('[Proxy] POST to cloud failed:', e.message);
    return false;
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,PUT,DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    next();
  });

  // ─── GET /api/sync ─────────────────────────────────────────────────────────
  app.get("/api/sync", async (req, res) => {
    try {
      // 1. Try cloud proxy first
      const cloudData = await cloudGet();
      if (cloudData) {
        // Cache locally in memory
        if (cloudData.records?.length) memoryStore.records = cloudData.records;
        if (cloudData.bays?.length) memoryStore.bays = cloudData.bays;
        return res.json(cloudData);
      }

      // 2. Try Redis
      const records = await redisGet(RECORDS_KEY) ?? memoryStore.records;
      const bays = await redisGet(LAYOUT_KEY) ?? memoryStore.bays;
      res.json({ records, bays });
    } catch (err: any) {
      console.error('[GET /api/sync] Error:', err.message);
      res.json({ records: memoryStore.records, bays: memoryStore.bays });
    }
  });

  // ─── POST /api/sync ────────────────────────────────────────────────────────
  app.post("/api/sync", async (req, res) => {
    const { records, bays } = req.body;
    try {
      if (records) memoryStore.records = records;
      if (bays) memoryStore.bays = bays;

      // Write to cloud (if configured)
      await cloudPost({ records, bays });

      // Write to Redis (if configured)
      if (records) await redisSet(RECORDS_KEY, records);
      if (bays) await redisSet(LAYOUT_KEY, bays);

      res.json({ success: true });
    } catch (err: any) {
      console.error('[POST /api/sync] Error:', err.message);
      res.json({ success: true, warning: err.message });
    }
  });

  // ─── GET /api/data (local Excel) ──────────────────────────────────────────
  app.get("/api/data", (req, res) => {
    let filePath = process.env.EXCEL_FILE_PATH || "PICKING.xlsb";

    if (req.query.path && typeof req.query.path === 'string') {
      filePath = req.query.path.replace(/\\/g, '/');
    }

    try {
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: `Arquivo não encontrado em: ${filePath}.` });
      }

      const fileBuffer = fs.readFileSync(filePath);
      const readFn = XLSX.read || (XLSX as any).default?.read;
      const utilsObj = XLSX.utils || (XLSX as any).default?.utils;

      const workbook = readFn(fileBuffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = utilsObj.sheet_to_json(worksheet);

      res.json({ records: data });
    } catch (error: any) {
      console.error("Error reading Excel file:", error);
      res.status(500).json({ error: `Falha ao ler o arquivo Excel: ${error.message || 'Erro Desconhecido.'}` });
    }
  });

  // ─── Vite Dev Server ──────────────────────────────────────────────────────
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n🚀 Server running on http://localhost:${PORT}`);
    if (CLOUD_URL) {
      console.log(`☁️  Cloud sync: proxying to ${CLOUD_URL}`);
    } else if (process.env.REDIS_URL || process.env.KV_REST_API_URL) {
      console.log(`🗄️  Cloud sync: using Redis`);
    } else {
      console.log(`⚠️  Cloud sync: NOT configured. Add CLOUD_URL=https://seu-app.vercel.app to .env`);
    }
    console.log('');
  });
}

startServer();