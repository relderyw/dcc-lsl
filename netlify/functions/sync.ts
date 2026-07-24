import type { Handler, HandlerEvent } from '@netlify/functions';
import { Redis as UpstashRedis } from '@upstash/redis';
import IORedis from 'ioredis';

// Cache da conexão para reuso entre invocações
let ioredisClient: IORedis | null = null;
let upstashClient: UpstashRedis | null = null;

const RECORDS_KEY = 'picking_shared_data';
const LAYOUT_KEY  = 'picking_layout_data';

const getClient = () => {
  // 1. Prioridade para REDIS_URL (ioredis)
  if (process.env.REDIS_URL) {
    if (!ioredisClient) ioredisClient = new IORedis(process.env.REDIS_URL);
    return { type: 'ioredis', client: ioredisClient };
  }

  // 2. Fallback para Upstash REST (Vercel KV ou Upstash direto)
  const url   = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN  || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    if (!upstashClient) upstashClient = new UpstashRedis({ url, token });
    return { type: 'upstash', client: upstashClient };
  }

  return null;
};

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS,POST,PUT,DELETE',
  'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With',
};

export const handler: Handler = async (event: HandlerEvent) => {
  // Preflight CORS
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  try {
    const connection = getClient();

    if (!connection) {
      const keys = Object.keys(process.env).filter(
        k => k.includes('REDIS') || k.includes('KV') || k.includes('UPSTASH')
      );
      throw new Error(
        `CONEXAO_FALHOU: Nenhuma configuração válida de banco. Chaves encontradas: [${keys.join(', ')}]`
      );
    }

    const { type, client } = connection;

    // ── POST: salvar dados ────────────────────────────────────────────────────
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { records, bays } = body;

      if (records && Array.isArray(records)) {
        const val = JSON.stringify(records);
        if (type === 'ioredis') await (client as IORedis).set(RECORDS_KEY, val);
        else                    await (client as UpstashRedis).set(RECORDS_KEY, val);
      }

      if (bays && Array.isArray(bays)) {
        const val = JSON.stringify(bays);
        if (type === 'ioredis') await (client as IORedis).set(LAYOUT_KEY, val);
        else                    await (client as UpstashRedis).set(LAYOUT_KEY, val);
      }

      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, message: 'Sincronizado!' }),
      };
    }

    // ── GET: buscar dados ─────────────────────────────────────────────────────
    if (event.httpMethod === 'GET') {
      let recordsData: any;
      let layoutData: any;

      if (type === 'ioredis') {
        recordsData = await (client as IORedis).get(RECORDS_KEY);
        layoutData  = await (client as IORedis).get(LAYOUT_KEY);
      } else {
        recordsData = await (client as UpstashRedis).get(RECORDS_KEY);
        layoutData  = await (client as UpstashRedis).get(LAYOUT_KEY);
      }

      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          records: typeof recordsData === 'string' ? JSON.parse(recordsData) : (recordsData ?? []),
          bays:    typeof layoutData  === 'string' ? JSON.parse(layoutData)  : (layoutData  ?? []),
        }),
      };
    }

    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Método não permitido' }),
    };

  } catch (error: any) {
    console.error('Netlify Function Error:', error.message);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        message: error.message,
        tip: 'Verifique as variáveis de ambiente no painel do Netlify.',
      }),
    };
  }
};
