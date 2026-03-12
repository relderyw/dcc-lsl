import { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';

// Inicialização Limpa e Explícita
const getRedisClient = () => {
  // 1. Tenta padrão Vercel KV
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    return new Redis({ 
      url: process.env.KV_REST_API_URL, 
      token: process.env.KV_REST_API_TOKEN 
    });
  }
  
  // 2. Tenta padrão Upstash Marketplace / Redis-as-a-Service
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return new Redis({ 
      url: process.env.UPSTASH_REDIS_REST_URL, 
      token: process.env.UPSTASH_REDIS_REST_TOKEN 
    });
  }

  // Não tenta adivinhar se as variáveis acima falharem
  return null;
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
      // Se chegamos aqui, as variáveis NÃO estão no sistema do Vercel
      const envKeys = Object.keys(process.env).filter(k => k.includes('REDIS') || k.includes('KV') || k.includes('UPSTASH'));
      throw new Error(`VARIÁVEIS_NÃO_ENCONTRADAS: O Vercel ainda não injetou as senhas do banco. Chaves achadas: [${envKeys.join(', ')}]. Certifique-se de que clicou em 'Connect Project' na aba Storage.`);
    }

    if (req.method === 'POST') {
      const { records } = req.body;
      if (records && Array.isArray(records)) {
        await redis.set(DATA_KEY, records); // @upstash/redis já lida com JSON automaticamente
        return res.status(200).json({ success: true, message: 'Dados sincronizados com sucesso!' });
      }
      return res.status(400).json({ error: 'Payload inválido: records deve ser uma lista.' });
    }

    if (req.method === 'GET') {
      const data = await redis.get(DATA_KEY);
      return res.status(200).json({ records: data || [] });
    }

    return res.status(405).json({ error: 'Método não permitido' });

  } catch (error: any) {
    console.error('API Sync Error:', error.message);
    
    return res.status(500).json({ 
      success: false, 
      message: error.message,
      tip: "Verifique se o banco está conectado ao projeto 'dcc-lsl' no painel da Vercel. Se acabou de conectar, faça um Redeploy."
    });
  }
}
