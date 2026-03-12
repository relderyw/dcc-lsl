import { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';

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
    // Verificação básica de conexão antes de prosseguir
    // O @vercel/kv injeta automaticamente as variáveis KV_REST_API_URL e KV_REST_API_TOKEN
    if (!process.env.KV_REST_API_URL) {
      throw new Error("VARIÁVEL_AUSENTE: O banco de dados KV não está conectado a este projeto. Vá em 'Storage' no Vercel e clique em 'Connect'.");
    }

    if (req.method === 'POST') {
      const { records } = req.body;
      if (records && Array.isArray(records)) {
        await kv.set(DATA_KEY, records);
        return res.status(200).json({ success: true, message: 'Dados sincronizados!' });
      }
      return res.status(400).json({ error: 'Dados inválidos. Envie um objeto com a chave "records" contendo uma lista.' });
    }

    if (req.method === 'GET') {
      const sharedData = await kv.get(DATA_KEY);
      return res.status(200).json({ records: sharedData || [] });
    }

    return res.status(405).json({ error: 'Método não permitido' });

  } catch (error: any) {
    console.error('API Sync Error:', error.message);
    
    return res.status(500).json({ 
      success: false, 
      error: 'SERVER_STORAGE_ERROR',
      message: error.message 
    });
  }
}
