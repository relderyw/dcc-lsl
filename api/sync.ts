import { VercelRequest, VercelResponse } from '@vercel/node';

// Memória temporária para o Vercel (dura alguns minutos)
// Nota: Para produção real com persistência, usaríamos Vercel KV.
// Mas para o fluxo de 30 segundos, isso funciona como cache.
let globalData: any = null;

export default function handler(req: VercelRequest, res: VercelResponse) {
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

  if (req.method === 'POST') {
    const { records } = req.body;
    if (records) {
      globalData = records;
      return res.status(200).json({ success: true, message: 'Dados sincronizados com sucesso!' });
    }
    return res.status(400).json({ error: 'Formato inválido' });
  }

  if (req.method === 'GET') {
    return res.status(200).json({ records: globalData });
  }

  res.status(405).json({ error: 'Método não permitido' });
}
