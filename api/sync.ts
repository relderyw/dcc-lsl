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
    if (req.method === 'POST') {
      const { records } = req.body;
      if (records) {
        // Salva no banco de dados permanente (Redis/KV)
        await kv.set(DATA_KEY, records);
        return res.status(200).json({ success: true, message: 'Dados sincronizados com sucesso!' });
      }
      return res.status(400).json({ error: 'Formato inválido: records não encontrado no body.' });
    }

    if (req.method === 'GET') {
      // Busca do banco de dados permanente
      const sharedData = await kv.get(DATA_KEY);
      return res.status(200).json({ records: sharedData || [] });
    }

    return res.status(405).json({ error: 'Método não permitido' });

  } catch (error: any) {
    console.error('Error in sync API:', error);
    
    // Erro comum: KV_URL missing (Database não conectada ao projeto)
    if (error.message && error.message.includes('KV_URL')) {
      return res.status(500).json({ 
        success: false, 
        error: 'DATABASE_NOT_CONNECTED',
        message: 'O banco de dados foi criado, mas NÃO foi conectado ao seu projeto dcc-lsl no painel do Vercel.' 
      });
    }

    return res.status(500).json({ 
      success: false, 
      error: 'INTERNAL_ERROR',
      message: error.message 
    });
  }
}
