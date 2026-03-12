import { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis as UpstashRedis } from '@upstash/redis';
import IORedis from 'ioredis';

// Cache da conexão para reuso em Serverless
let ioredisClient: IORedis | null = null;
let upstashClient: UpstashRedis | null = null;

const getClient = () => {
  // 1. Prioridade para REDIS_URL (ioredis) - É o que foi achado no seu servidor
  if (process.env.REDIS_URL) {
    if (!ioredisClient) ioredisClient = new IORedis(process.env.REDIS_URL);
    return { type: 'ioredis', client: ioredisClient };
  }

  // 2. Fallback para Vercel KV / Upstash REST
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  
  if (url && token) {
    if (!upstashClient) upstashClient = new UpstashRedis({ url, token });
    return { type: 'upstash', client: upstashClient };
  }

  return null;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const RECORDS_KEY = 'picking_shared_data';
  const LAYOUT_KEY = 'picking_layout_data';
  const connection = getClient();

  try {
    if (!connection) {
      const keys = Object.keys(process.env).filter(k => k.includes('REDIS') || k.includes('KV') || k.includes('UPSTASH'));
      throw new Error(`CONEXAO_FALHOU: Nenhuma configuração válida de banco. Chaves: [${keys.join(', ')}]`);
    }

    const { type, client } = connection;

    if (req.method === 'POST') {
      const { records, bays } = req.body;
      
      // Salvar Registros do Excel
      if (records && Array.isArray(records)) {
        const val = JSON.stringify(records);
        if (type === 'ioredis') await (client as IORedis).set(RECORDS_KEY, val);
        else await (client as UpstashRedis).set(RECORDS_KEY, val);
      }
      
      // Salvar Layout do Mapa (Baias)
      if (bays && Array.isArray(bays)) {
        const val = JSON.stringify(bays);
        if (type === 'ioredis') await (client as IORedis).set(LAYOUT_KEY, val);
        else await (client as UpstashRedis).set(LAYOUT_KEY, val);
      }

      return res.status(200).json({ success: true, message: 'Sincronizado!' });
    }

    if (req.method === 'GET') {
      let recordsData: any;
      let layoutData: any;

      if (type === 'ioredis') {
        recordsData = await (client as IORedis).get(RECORDS_KEY);
        layoutData = await (client as IORedis).get(LAYOUT_KEY);
      } else {
        recordsData = await (client as UpstashRedis).get(RECORDS_KEY);
        layoutData = await (client as UpstashRedis).get(LAYOUT_KEY);
      }
      
      return res.status(200).json({ 
        records: typeof recordsData === 'string' ? JSON.parse(recordsData) : (recordsData || []),
        bays: typeof layoutData === 'string' ? JSON.parse(layoutData) : (layoutData || [])
      });
    }

    return res.status(405).json({ error: 'Método não permitido' });

  } catch (error: any) {
    console.error('API Error:', error.message);
    return res.status(500).json({ 
      success: false, 
      message: error.message,
      tip: "Verifique a conexão no painel Vercel Storage."
    });
  }
}
