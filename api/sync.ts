import { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';

// Inicialização robusta do cliente Redis
const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const DATA_KEY = 'picking_shared_data';

  try {
    // Validar se as variáveis de ambiente estão presentes
    if (!process.env.KV_REST_API_URL && !process.env.UPSTASH_REDIS_REST_URL) {
      throw new Error('DATABASE_MISSING_VARS: Favor reconectar o Redis ao projeto e fazer o REDEPLOY do site.');
    }

    if (req.method === 'POST') {
      const { records } = req.body;
      if (records) {
        await redis.set(DATA_KEY, records);
        return res.status(200).json({ success: true, message: 'Dados sincronizados com sucesso!' });
      }
      return res.status(400).json({ error: 'Formato inválido: records não encontrado.' });
    }

    if (req.method === 'GET') {
      const sharedData = await redis.get(DATA_KEY);
      return res.status(200).json({ records: sharedData || [] });
    }

    return res.status(405).json({ error: 'Método não permitido' });

  } catch (error: any) {
    console.error('Error in sync API:', error);
    
    return res.status(500).json({ 
      success: false, 
      error: 'INTERNAL_ERROR',
      message: error.message 
    });
  }
}
