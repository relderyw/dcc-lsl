import { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';

// Função para tentar criar o cliente com o que estiver disponível
const getRedisClient = () => {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_REST_API_TOKEN;

  // Se tivermos URL e TOKEN (Upstash/HTTP)
  if (url && token) {
    return new Redis({ url, token });
  }
  
  // Caso o Vercel tenha injetado via REDIS_URL (Padrão Marketplace)
  if (process.env.REDIS_URL) {
    // Nota: @upstash/redis prefere REST. Se for apenas REDIS_URL, pode ser um nó diferente.
    // Mas vamos tentar carregar do ambiente se ele encontrar os padrões automáticos.
    try {
      return Redis.fromEnv();
    } catch (e) {
      return null;
    }
  }

  return null;
};

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
  const redis = getRedisClient();

  try {
    if (!redis) {
      // Diagnóstico: Listar as chaves de ambiente disponíveis (sem mostrar os valores por segurança)
      const availableKeys = Object.keys(process.env).filter(k => k.includes('REDIS') || k.includes('KV') || k.includes('UPSTASH'));
      throw new Error(`DATABASE_NOT_CONFIGURED: Nenhuma variável de conexão encontrada. Chaves disponíveis: ${availableKeys.join(', ')}`);
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
      error: 'STORAGE_ERROR',
      message: error.message 
    });
  }
}
