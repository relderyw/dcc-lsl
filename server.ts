import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import * as XLSX from "xlsx";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API Route to read the Excel file (.xlsb)
  app.get("/api/data", (req, res) => {
    let filePath = process.env.EXCEL_FILE_PATH || "PICKING.xlsb";
    
    if (req.query.path && typeof req.query.path === 'string') {
      filePath = req.query.path.replace(/\\/g, '/'); // Normalize slashes for safety
    }

    try {
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: `Arquivo não encontrado em: ${filePath}. Por favor, verifique se o caminho do arquivo está correto e se o arquivo PICKING.xlsb existe na pasta.` });
      }

      const fileBuffer = fs.readFileSync(filePath);
      // fallback for various module exports shapes
      const readFn = XLSX.read || (XLSX as any).default?.read;
      const utilsObj = XLSX.utils || (XLSX as any).default?.utils;
      
      const workbook = readFn(fileBuffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = utilsObj.sheet_to_json(worksheet);
      
      res.json({ records: data });
    } catch (error: any) {
      console.error("Error reading Excel file:", error);
      res.status(500).json({ error: `Falha ao ler o arquivo Excel: ${error.message || 'Erro Desconhecido. O arquivo pode estar aberto em outro programa e bloqueado pelo Windows.'}` });
    }
  });

  // Vite middleware for development
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
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
