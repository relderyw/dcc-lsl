import { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';

// Inicialização "Camaleão" - Se adapta ao que o Vercel injetar
const getRedisClient = () => {
  // Tenta padrão Vercel KV
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    return new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
  }
  // Tenta padrão Upstash Marketplace
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN });
  }
  // Tenta carregar automaticamente do ambiente
  try {
    return Redis.fromEnv();
  } catch (e) {
    return null;
  }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const DATA_KEY = 'picking_shared_data';
  const redis = getRedisClient();

  try {
    if (!redis) {
      // Diagnóstico detalhado para o LOG do Vercel
      const envs = Object.keys(process.env).filter(k => k.includes('REDIS') || k.includes('KV') || k.includes('UPSTASH'));
      throw new Error(`BANCO_NAO_CONECTADO: O projeto dcc-lsl ainda não tem as variáveis de ambiente. Variáveis achadas: ${envs.join(', ')}`);
    }

    if (req.method === 'POST') {
      const { records } = req.body;
      if (records && Array.isArray(records)) {
        await redis.set(DATA_KEY, JSON.stringify(records));
        return res.status(200).json({ success: true, message: 'Ok!' });
      }
      return res.status(400).json({ error: 'Payload inválido' });
    }

    if (req.method === 'GET') {
      const data = await redis.get(DATA_KEY);
      // O Upstash pode retornar string ou objeto dependendo do parser
      const records = typeof data === 'string' ? JSON.parse(data) : (data || []);
      return res.status(200).json({ records });
    }

    return res.status(405).json({ error: 'Metodo não permitido' });

  } catch (error: any) {
    console.error('API Error:', error.message);
    return res.status(500).json({ 
      success: false, 
      message: error.message,
      tip: "Verifique se clicou em 'Connect Project' no painel do Storage e fez o REDEPLOY."
    });
  }
}
