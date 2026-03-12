/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Trash2, 
  Settings2, 
  Layout, 
  Car, 
  CheckCircle2, 
  AlertCircle, 
  ChevronRight, 
  ChevronLeft,
  Save,
  MousePointer2,
  Box,
  Info,
  Database,
  Search,
  RefreshCw,
  FileSpreadsheet,
  Clock,
  MapPin,
  Upload,
  Sun,
  Moon,
  Hash,
  Activity,
  Calendar,
  Truck,
  Copy,
  AlertTriangle,
  X
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { dataService, CarRecord } from './services/dataService';

// --- Utilities ---
const snapToGrid = (val: number, step = 1) => Math.round(val / step) * step;

const cn = (...inputs: ClassValue[]) => {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface Bay {
  id: string;
  name: string; // This should match LOC_FISICA for auto-sync
  capacity: number;
  currentCars: number; // Manual override if not synced
  sectors: string[];
  sector?: string;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  width: number; // percentage 0-100
  height: number; // percentage 0-100
  slotHeight?: number; // Custom height for each car slot in pixels
}

type Mode = 'view' | 'edit' | 'database';

// --- Constants ---
const STORAGE_KEY = 'motolog_warehouse_config';
const EXCEL_PATH_KEY = 'motolog_excel_path_v2';
const DEFAULT_IMAGE = 'https://storage.googleapis.com/m-infra-prod-public-assets/ais/warehouse_layout_picking.png';
const LOGO_URL = "https://media.licdn.com/dms/image/v2/C4E0BAQFpxXvoZ7i-dQ/company-logo_200_200/company-logo_200_200/0/1630634869842?e=2147483647&v=beta&t=CVrW6q1wEDZRXzUAzc7uy3ZAQYv_NL-cr7ohpcPka7I";

function parseExcelDate(dateStr?: string, timeStr?: string): Date | null {
  if (!dateStr || !timeStr) return null;
  const [day, month, year] = dateStr.split('/');
  if (!day || !month || !year) return null;
  const [hours, minutes] = timeStr.split(':');
  const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hours || '0'), parseInt(minutes || '0'));
  return isNaN(d.getTime()) ? null : d;
}

function getSlaStatus(car: CarRecord): { text: string, color: string, isLate: boolean } {
  const targetDate = parseExcelDate(car.embarkDate, car.embarkTime);
  if (!targetDate) return { text: 'S/ DATA', color: 'bg-slate-500', isLate: false };

  const now = new Date();
  const diffMs = targetDate.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 0) {
    return { text: 'ATRASADO', color: 'bg-rose-500', isLate: true };
  } else if (diffHours <= 1) {
    return { text: 'PRÓX. EMB.', color: 'bg-amber-500', isLate: false };
  } else {
    return { text: 'NO PRAZO', color: 'bg-emerald-500', isLate: false };
  }
}

export default function App() {
  const [bays, setBays] = useState<Bay[]>([]);
  const [mode, setMode] = useState<Mode>('view');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [selectedBayId, setSelectedBayId] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [currentRect, setCurrentRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [tempBay, setTempBay] = useState<Bay | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dbRecords, setDbRecords] = useState<CarRecord[]>(dataService.getRecords());
  const [importText, setImportText] = useState('');
  const [localExcelPath, setLocalExcelPath] = useState(localStorage.getItem(EXCEL_PATH_KEY) || 'C:\\PICKING.xlsb');
  const [remoteApiUrl, setRemoteApiUrl] = useState(localStorage.getItem('picking_remote_api') || ''); // For Vercel -> Local Tunnel
  const [sharepointUrl, setSharepointUrl] = useState(localStorage.getItem('picking_sharepoint_url') || ''); // For SharePoint/Direct Link
  const [showImport, setShowImport] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [hoverConfig, setHoverConfig] = useState<Record<string, boolean>>({
    carId: true,
    model: true,
    status: true,
    sectorName: true,
    embarkDate: true,
    embarkTime: true,
    carPhysical: false,
    sectorId: false
  });
  const [hoveredCar, setHoveredCar] = useState<{ car: CarRecord; x: number; y: number } | null>(null);

  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Filters State
  const [filterModel, setFilterModel] = useState<string>('ALL');
  const [filterSector, setFilterSector] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL'); // 'ALL' | 'LATE' | 'NEXT' | 'ONTIME'
  const [filterExcelStatus, setFilterExcelStatus] = useState<string>('ALL'); // 'ALL' | string from Excel 'status' column
  const [filterCarId, setFilterCarId] = useState<string>('');

  const containerRef = useRef<HTMLDivElement>(null);

  const fetchData = async () => {
    try {
      // 1. Try the new Sync API (where VBA pushes data)
      const syncResponse = await fetch('/api/sync');
      if (syncResponse.ok) {
        const syncData = await syncResponse.json();
        if (syncData.records && syncData.records.length > 0) {
          const newRecords = dataService.importJSON(syncData.records);
          setDbRecords([...newRecords]);
          setLastUpdate(new Date());
          return; // Success from push data
        }
      }

      // 2. Try SharePoint/Direct Link second if available...
      const baseUrl = remoteApiUrl || '';
      const query = localExcelPath ? `?path=${encodeURIComponent(localExcelPath)}` : '';
      const response = await fetch(`${baseUrl}/api/data${query}`);
      if (response.ok) {
        const data = await response.json();
        if (data.records) {
          const newRecords = dataService.importJSON(data.records);
          setDbRecords([...newRecords]);
          setLastUpdate(new Date());
        }
      } else {
        const err = await response.json();
        console.error("Auto-refresh errored:", err);
        alert(`Erro de Leitura Local: ${err.error || response.statusText}`);
      }
    } catch (error) {
      console.error('Auto-refresh failed:', error);
    }
  };

  // Auto-refresh logic
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (autoRefresh) {
      fetchData(); // Initial fetch
      interval = setInterval(fetchData, 30000); // Every 30s
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, localExcelPath]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && 
          selectedBayId && 
          mode === 'edit' && 
          document.activeElement?.tagName !== 'INPUT' &&
          document.activeElement?.tagName !== 'TEXTAREA') {
        deleteBay(selectedBayId);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedBayId, mode]);

  // Load data
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setBays(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load bays', e);
      }
    }
  }, []);

  // Save data
  const saveBays = (newBays: Bay[]) => {
    try {
      setBays(newBays);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newBays));
    } catch (e) {
      console.error('Failed to save bays', e);
      alert('Erro ao salvar as configurações no navegador. O armazenamento pode estar cheio.');
    }
  };

  // Carregar dados salvos ao iniciar
  useEffect(() => {
    const saved = localStorage.getItem('picking_records');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setDbRecords(parsed);
      } catch (e) {
        console.error("Erro ao carregar cache local", e);
      }
    }
  }, []);

  // Salvar dados sempre que mudar
  useEffect(() => {
    if (dbRecords.length > 0) {
      localStorage.setItem('picking_records', JSON.stringify(dbRecords));
    }
  }, [dbRecords]);

  const autoGenerateBays = () => {
    if (dbRecords.length === 0) {
      alert('Nenhum dado encontrado na base. Importe um arquivo Excel primeiro.');
      return;
    }

    const uniqueLocations: string[] = Array.from(new Set(dbRecords.map(r => r.location).filter(Boolean)));
    const existingNames = new Set(bays.map(b => b.name));
    
    const newBaysToAdd: Bay[] = uniqueLocations
      .filter(loc => !existingNames.has(loc))
      .map((loc, index) => ({
        id: `bay-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        name: loc,
        capacity: 10,
        currentCars: 0,
        sectors: [],
        sector: '',
        slotHeight: 25,
        x: 2 + (index % 12) * 8,
        y: 2 + Math.floor(index / 12) * 8,
        width: 6,
        height: 6
      }));

    if (newBaysToAdd.length > 0) {
      saveBays([...bays, ...newBaysToAdd]);
      alert(`${newBaysToAdd.length} novas baias geradas com sucesso!`);
    } else {
      alert('Todas as locações do Excel já possuem baias mapeadas no mapa.');
    }
  };

  const availableLocations = useMemo(() => {
    return Array.from(new Set(dbRecords.map(r => r.location).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b)));
  }, [dbRecords]);

  const availableSectors = useMemo(() => {
    return Array.from(new Set(dbRecords.map(r => r.sectorName).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b)));
  }, [dbRecords]);
  
  const availableModels = useMemo(() => {
    return Array.from(new Set(dbRecords.map(r => r.model).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b)));
  }, [dbRecords]);

  const availableExcelStatuses = useMemo(() => {
    return Array.from(new Set(dbRecords.map(r => r.status).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b)));
  }, [dbRecords]);

  const selectedBay = useMemo(() => bays.find(b => b.id === selectedBayId), [bays, selectedBayId]);

  // Cars in selected bay
  const carsInSelectedBay = useMemo(() => {
    if (!selectedBay) return [];
    return dbRecords.filter(r => r.location === selectedBay.name);
  }, [selectedBay, dbRecords]);

  // --- Map Interactions ---
  const getCoords = (e: React.MouseEvent | MouseEvent) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    return { x, y };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const coords = getCoords(e);
    
    // Check if clicking on an existing bay
    const clickedBay = bays.find(b => 
      coords.x >= b.x && coords.x <= b.x + b.width &&
      coords.y >= b.y && coords.y <= b.y + b.height
    );

    if (clickedBay) {
      setSelectedBayId(clickedBay.id);
      
      if (mode === 'edit') {
        // Check for resize handle (bottom-right area)
        const handleSize = 3; // 3% of container for easier clicking
        const isOnResizeHandle = 
          coords.x >= clickedBay.x + clickedBay.width - handleSize && 
          coords.x <= clickedBay.x + clickedBay.width &&
          coords.y >= clickedBay.y + clickedBay.height - handleSize && 
          coords.y <= clickedBay.y + clickedBay.height;

        if (isOnResizeHandle) {
          setIsResizing(true);
          setTempBay({ ...clickedBay });
        } else {
          setIsDragging(true);
          setDragOffset({
            x: coords.x - clickedBay.x,
            y: coords.y - clickedBay.y
          });
          setTempBay({ ...clickedBay });
        }
      }
    } else {
      if (mode === 'edit') {
        setIsDrawing(true);
        setDragStart(coords);
        setCurrentRect({ x: coords.x, y: coords.y, w: 0, h: 0 });
      }
      setSelectedBayId(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const coords = getCoords(e);

    if (isDragging && selectedBayId && dragOffset && tempBay) {
      setTempBay({
        ...tempBay,
        x: snapToGrid(coords.x - dragOffset.x, 0.5),
        y: snapToGrid(coords.y - dragOffset.y, 0.5)
      });
      return;
    }

    if (isResizing && selectedBayId && tempBay) {
      const newWidth = snapToGrid(Math.max(1, coords.x - tempBay.x), 0.5);
      const newHeight = snapToGrid(Math.max(1, coords.y - tempBay.y), 0.5);
      // Auto-calculate capacity based on height (approx 3% per car)
      const estimatedCapacity = Math.max(1, Math.floor(newHeight / 2.5));
      
      setTempBay({
        ...tempBay,
        width: newWidth,
        height: newHeight,
        capacity: estimatedCapacity
      });
      return;
    }

    if (!isDrawing || !dragStart) return;
    const w = snapToGrid(Math.abs(coords.x - dragStart.x), 0.5);
    const h = snapToGrid(Math.abs(coords.y - dragStart.y), 0.5);
    setCurrentRect({
      x: snapToGrid(Math.min(dragStart.x, coords.x), 0.5),
      y: snapToGrid(Math.min(dragStart.y, coords.y), 0.5),
      w,
      h,
    });
  };

  const handleMouseUp = () => {
    if (isDragging && tempBay && selectedBayId) {
      updateBay(selectedBayId, { x: tempBay.x, y: tempBay.y });
    }
    
    if (isResizing && tempBay && selectedBayId) {
      updateBay(selectedBayId, { 
        width: tempBay.width, 
        height: tempBay.height,
        capacity: tempBay.capacity
      });
    }

    setIsDragging(false);
    setIsResizing(false);
    setDragOffset(null);
    setTempBay(null);

    if (!isDrawing || !currentRect) return;
    setIsDrawing(false);
    
    if (currentRect.w > 1 && currentRect.h > 1) {
      const estimatedCapacity = Math.max(1, Math.floor(currentRect.h / 2.5));
      
      // Find the next sequential index for naming
      const nextIndex = bays.reduce((max, bay) => {
        const match = bay.name.match(/PICK-(\d+)-01/);
        if (match) {
          const num = parseInt(match[1]);
          return Math.max(max, num);
        }
        return max;
      }, 0) + 1;
      
      const newBay: Bay = {
        id: `bay-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        name: `PICK-${nextIndex.toString().padStart(2, '0')}-01`,
        capacity: estimatedCapacity,
        currentCars: 0,
        sectors: [],
        sector: '',
        x: currentRect.x,
        y: currentRect.y,
        width: currentRect.w,
        height: currentRect.h,
      };
      saveBays([...bays, newBay]);
      setSelectedBayId(newBay.id);
    }
    
    setCurrentRect(null);
    setDragStart(null);
  };

  const updateBay = (id: string, updates: Partial<Bay>) => {
    const newBays = bays.map(b => b.id === id ? { ...b, ...updates } : b);
    saveBays(newBays);
  };

  const deleteBay = (id: string) => {
    const newBays = bays.filter(b => b.id !== id);
    saveBays(newBays);
    setSelectedBayId(null);
  };

  const duplicateBay = (bay: Bay) => {
    const newBay: Bay = {
      ...bay,
      id: crypto.randomUUID(),
      name: `${bay.name} (Cópia)`,
      x: snapToGrid(Math.min(bay.x + 2.5, 90), 0.5), // Offset slightly and snap
      y: snapToGrid(bay.y, 0.5), // Keep Perfect Vertical Alignment
    };
    saveBays([...bays, newBay]);
    setSelectedBayId(newBay.id);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const bstr = event.target?.result;
      const workbook = XLSX.read(bstr, { type: 'binary' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);
      
      const newRecords = dataService.importJSON(data);
      setDbRecords([...newRecords]);
      setLastUpdate(new Date());
    };
    reader.readAsBinaryString(file);
  };

  const handleImport = () => {
    if (!importText.trim()) return;
    const newRecords = dataService.importCSV(importText);
    setDbRecords([...newRecords]);
    setImportText('');
    setShowImport(false);
  };

  return (
    <div className={cn(
      "flex h-screen w-screen font-sans overflow-hidden transition-colors duration-500",
      theme === 'dark' 
        ? "bg-slate-950 text-slate-200" 
        : "bg-slate-50 text-slate-900"
    )}>
      {/* --- Sidebar --- */}
      <AnimatePresence mode="wait">
        {sidebarOpen && (
          <motion.aside
            initial={{ x: -450 }}
            animate={{ x: 0 }}
            exit={{ x: -450 }}
            className={cn(
              "w-[420px] min-w-[420px] shrink-0 h-full border-r flex flex-col z-20 shadow-2xl transition-all duration-300",
              theme === 'dark' 
                ? "bg-slate-900 border-slate-800" 
                : "bg-white/95 border-slate-200/60 backdrop-blur-xl shadow-slate-200/50"
            )}
          >
            <div className={cn(
              "p-6 border-b flex flex-col gap-4 transition-colors duration-300",
              theme === 'dark' ? "border-slate-800" : "border-slate-200"
            )}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg overflow-hidden bg-white flex items-center justify-center border border-slate-200 shadow-sm">
                    <img src={LOGO_URL} alt="Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                  </div>
                  <div className="flex flex-col justify-center">
                    <h1 className={cn(
                      "font-black text-lg tracking-tight leading-none transition-colors duration-300",
                      theme === 'dark' ? "text-white" : "text-slate-900"
                    )}>
                      Controle
                    </h1>
                    <h1 className="font-black text-lg tracking-tight leading-none text-emerald-500">
                      DCC
                    </h1>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                    className={cn(
                      "p-2 rounded-lg transition-all duration-300",
                      theme === 'dark' ? "hover:bg-slate-800 text-amber-400" : "hover:bg-slate-100 text-slate-600"
                    )}
                  >
                    {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                  </button>
                  <button 
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      "p-1 rounded-md transition-colors",
                      theme === 'dark' ? "hover:bg-slate-800 text-slate-400" : "hover:bg-slate-100 text-slate-500"
                    )}
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
              {/* Mode Toggle */}
              <div className={cn(
                "p-1 rounded-xl flex gap-1 transition-all duration-300",
                theme === 'dark' ? "bg-slate-800/50" : "bg-slate-200/40 border border-slate-200/60"
              )}>
                <button
                  onClick={() => setMode('view')}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-all",
                    mode === 'view' 
                      ? (theme === 'dark' ? "bg-slate-700 text-white shadow-lg" : "bg-white text-slate-900 shadow-sm") 
                      : (theme === 'dark' ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-700")
                  )}
                >
                  <MousePointer2 className="w-3.5 h-3.5" />
                  Mapa
                </button>
                <button
                  onClick={() => setMode('edit')}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-all",
                    mode === 'edit' 
                      ? "bg-emerald-600 text-white shadow-lg active:scale-95" 
                      : (theme === 'dark' ? "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50" : "text-slate-500 hover:text-emerald-600 hover:bg-emerald-50")
                  )}
                >
                  <Settings2 className="w-3.5 h-3.5" />
                  Layout
                </button>
                <button
                  onClick={() => setMode('database')}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-all",
                    mode === 'database' 
                      ? "bg-blue-600 text-white shadow-lg" 
                      : (theme === 'dark' ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-700")
                  )}
                >
                  <Database className="w-3.5 h-3.5" />
                  Dados
                </button>
              </div>

              {/* Sidebar Content based on Mode */}
              {mode === 'edit' && (
                <div className="space-y-2">
                  <h2 className={cn(
                    "text-[10px] font-bold uppercase tracking-widest px-1 transition-colors duration-300",
                    theme === 'dark' ? "text-slate-500" : "text-slate-400"
                  )}>
                    Ações de Layout
                  </h2>
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      onClick={autoGenerateBays}
                      className={cn(
                        "flex flex-col items-center justify-center gap-1.5 p-3 border rounded-xl transition-all group",
                        theme === 'dark' 
                          ? "bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20" 
                          : "bg-emerald-50 border-emerald-100 hover:bg-emerald-100"
                      )}
                    >
                      <MapPin className="w-4 h-4 text-emerald-500 group-hover:scale-110 transition-transform" />
                      <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-tighter">Gerar Baias</span>
                    </button>
                    <button 
                      onClick={() => setShowClearConfirm(true)}
                      className={cn(
                        "flex flex-col items-center justify-center gap-1.5 p-3 border rounded-xl transition-all group",
                        theme === 'dark' 
                          ? "bg-rose-500/10 border-rose-500/20 hover:bg-rose-500/20" 
                          : "bg-rose-50 border-rose-100 hover:bg-rose-100"
                      )}
                    >
                      <Trash2 className="w-4 h-4 text-rose-500 group-hover:scale-110 transition-transform" />
                      <span className="text-[9px] font-bold text-rose-600 uppercase tracking-tighter">Limpar Mapa</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Visualization Settings */}
              <div className="space-y-3">
                <h2 className={cn(
                  "text-[10px] font-bold uppercase tracking-widest px-1 transition-colors duration-300",
                  theme === 'dark' ? "text-slate-500" : "text-slate-400"
                )}>
                  Informações no Hover
                </h2>
                <div className={cn(
                  "p-4 rounded-2xl border transition-all duration-300 grid grid-cols-1 gap-2",
                  theme === 'dark' ? "bg-slate-800/30 border-slate-800/50" : "bg-slate-100 border-slate-200"
                )}>
                  {[
                    { id: 'carId', label: 'ID do Carro' },
                    { id: 'model', label: 'Modelo' },
                    { id: 'status', label: 'Status' },
                    { id: 'sectorName', label: 'Setor' },
                    { id: 'embarkDate', label: 'Data Embarque' },
                    { id: 'embarkTime', label: 'Hora Embarque' },
                    { id: 'carPhysical', label: 'Carro Físico' },
                    { id: 'sectorId', label: 'ID Setor' },
                  ].map(field => (
                    <label key={field.id} className="flex items-center gap-3 cursor-pointer group">
                      <div className="relative flex items-center">
                        <input 
                          type="checkbox"
                          checked={hoverConfig[field.id]}
                          onChange={() => setHoverConfig(prev => ({ ...prev, [field.id]: !prev[field.id] }))}
                          className="sr-only"
                        />
                        <div className={cn(
                          "w-8 h-4 rounded-full transition-colors duration-200",
                          hoverConfig[field.id] ? "bg-emerald-500" : (theme === 'dark' ? "bg-slate-700" : "bg-slate-300")
                        )} />
                        <div className={cn(
                          "absolute left-1 w-2 h-2 bg-white rounded-full transition-transform duration-200",
                          hoverConfig[field.id] ? "translate-x-4" : "translate-x-0"
                        )} />
                      </div>
                      <span className={cn(
                        "text-[10px] font-medium transition-colors duration-300",
                        theme === 'dark' ? "text-slate-400 group-hover:text-slate-200" : "text-slate-600 group-hover:text-slate-900"
                      )}>
                        {field.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {mode === 'database' ? (
                <div className="space-y-4">
                  {/* SEÇÃO: MODO AUTOMÁTICO (MACRO VBA) */}
                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-3">
                    <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      MODO AUTOMÁTICO ATIVO
                    </div>
                    <p className="text-[10px] text-emerald-400/70 leading-relaxed italic">
                      O sistema agora recebe dados diretamente da sua Macro VBA. Os campos abaixo são opcionais para redundância.
                    </p>
                  </div>

                  <div className="space-y-4 pt-2 opacity-50 hover:opacity-100 transition-opacity">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">
                      Fontes de Backup (Opcional)
                    </p>
                    
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-slate-400 ml-1">Carregar Arquivo Manual</label>
                      <div className="flex gap-2">
                        <label className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-slate-800/50 hover:bg-slate-800 border-2 border-dashed border-slate-700 hover:border-blue-500/50 rounded-lg cursor-pointer transition-all group">
                          <Upload className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-400" />
                          <span className="text-xs text-slate-400 group-hover:text-blue-400">Escolher .xlsb</span>
                          <input type="file" className="hidden" accept=".xlsx, .xls, .xlsb" onChange={handleFileUpload} />
                        </label>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-slate-400 ml-1">Link SharePoint</label>
                      <input
                        type="text"
                        value={sharepointUrl}
                        onChange={(e) => {
                          setSharepointUrl(e.target.value);
                          localStorage.setItem('picking_sharepoint_url', e.target.value);
                        }}
                        placeholder="https://..."
                        className={cn(
                          "w-full px-3 py-2 border rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500/50",
                          theme === 'dark' ? "bg-slate-900 border-slate-700 text-slate-300" : "bg-white border-slate-300 text-slate-700"
                        )}
                      />
                      <p className="text-[9px] text-slate-500 italic">Funciona no Vercel mesmo com Zscaler.</p>
                    </div>
                  </div>
                  
                  <div className="space-y-2 pt-2">
                    {dbRecords.slice(0, 10).map(record => (
                      <div 
                        key={record.carId} 
                        className={cn(
                          "p-3 rounded-xl border transition-all duration-300 space-y-1",
                          theme === 'dark' ? "bg-slate-800/30 border-slate-800/50" : "bg-slate-100 border-slate-200"
                        )}
                      >
                        <div className="flex justify-between items-center">
                          <span className={cn(
                            "text-xs font-bold transition-colors duration-300",
                            theme === 'dark' ? "text-white" : "text-slate-900"
                          )}>
                            {record.carId}
                          </span>
                          <span className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded transition-colors duration-300",
                            theme === 'dark' ? "bg-slate-700 text-slate-300" : "bg-slate-200 text-slate-600"
                          )}>
                            {record.model}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-slate-500">
                          <MapPin className="w-2.5 h-2.5" />
                          {record.location}
                        </div>
                      </div>
                    ))}
                    {dbRecords.length > 10 && (
                      <p className="text-[10px] text-center text-slate-600 italic">E mais {dbRecords.length - 10} registros...</p>
                    )}
                  </div>
                </div>
              ) : selectedBay ? (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <h2 className={cn(
                      "text-xs font-bold uppercase tracking-widest transition-colors duration-300",
                      theme === 'dark' ? "text-slate-500" : "text-slate-400"
                    )}>
                      Configuração da Baia
                    </h2>
                    {mode === 'edit' && (
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => duplicateBay(selectedBay)}
                          className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold text-blue-500 hover:bg-blue-500/10 rounded-md transition-colors border border-blue-500/20"
                        >
                          <Copy className="w-3 h-3" />
                          DUPLICAR
                        </button>
                        <button 
                          onClick={() => {
                            if (confirm('Tem certeza que deseja excluir esta baia?')) {
                              deleteBay(selectedBay.id);
                            }
                          }}
                          className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold text-rose-500 hover:bg-rose-500/10 rounded-md transition-colors border border-rose-500/20"
                        >
                          <Trash2 className="w-3 h-3" />
                          EXCLUIR
                        </button>
                      </div>
                    )}
                  </div>

                  <div className={cn(
                    "space-y-4 p-4 rounded-2xl border transition-all duration-300 shadow-sm",
                    theme === 'dark' 
                      ? "bg-slate-800/30 border-slate-800/50" 
                      : "bg-slate-50/50 border-slate-200/60"
                  )}>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-500">ID da Locação (Excel)</label>
                      <input 
                        type="text"
                        list="locations-list"
                        value={selectedBay.name}
                        onChange={(e) => updateBay(selectedBay.id, { name: e.target.value })}
                        className={cn(
                          "w-full border rounded-lg px-3 py-2 text-base font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all",
                          theme === 'dark' 
                            ? "bg-slate-900 border-slate-700 text-white" 
                            : "bg-white border-slate-200 text-slate-900 shadow-inner shadow-slate-100"
                        )}
                        placeholder="Selecione ou digite..."
                      />
                      <datalist id="locations-list">
                        {availableLocations.map(loc => (
                          <option key={loc} value={loc} />
                        ))}
                      </datalist>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-500">Setor Vinculado</label>
                      <input 
                        type="text"
                        list="sectors-list"
                        value={selectedBay.sector || ''}
                        onChange={(e) => updateBay(selectedBay.id, { sector: e.target.value })}
                        className={cn(
                          "w-full border rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all",
                          theme === 'dark' ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                        )}
                        placeholder="Selecione ou digite o Setor..."
                      />
                      <datalist id="sectors-list">
                        {availableSectors.map(sec => (
                          <option key={sec} value={sec} />
                        ))}
                      </datalist>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-500">Capacidade Máxima</label>
                        <input 
                          type="number"
                          value={selectedBay.capacity}
                          min="1"
                          onChange={(e) => updateBay(selectedBay.id, { capacity: parseInt(e.target.value) || 1 })}
                          className={cn(
                            "w-full border rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all",
                            theme === 'dark' ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                          )}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-500">Altura do Slot</label>
                        <input 
                          type="number"
                          value={selectedBay.slotHeight || 25}
                          min="10"
                          max="200"
                          onChange={(e) => updateBay(selectedBay.id, { slotHeight: parseInt(e.target.value) || 25 })}
                          className={cn(
                            "w-full border rounded-lg px-1 py-2 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all",
                            theme === 'dark' ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                          )}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <div className="space-y-1">
                        <label className="text-[10px] font-medium text-slate-500 uppercase">Posição X (%)</label>
                        <input 
                          type="number"
                          value={Math.round(selectedBay.x)}
                          onChange={(e) => updateBay(selectedBay.id, { x: parseFloat(e.target.value) || 0 })}
                          className={cn(
                            "w-full border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500/50",
                            theme === 'dark' ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                          )}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-medium text-slate-500 uppercase">Posição Y (%)</label>
                        <input 
                          type="number"
                          value={Math.round(selectedBay.y)}
                          onChange={(e) => updateBay(selectedBay.id, { y: parseFloat(e.target.value) || 0 })}
                          className={cn(
                            "w-full border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500/50",
                            theme === 'dark' ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                          )}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-medium text-slate-500 uppercase">Largura (%)</label>
                        <input 
                          type="number"
                          value={Math.round(selectedBay.width)}
                          onChange={(e) => updateBay(selectedBay.id, { width: parseFloat(e.target.value) || 0 })}
                          className={cn(
                            "w-full border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500/50",
                            theme === 'dark' ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                          )}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-medium text-slate-500 uppercase">Altura (%)</label>
                        <input 
                          type="number"
                          value={Math.round(selectedBay.height)}
                          onChange={(e) => updateBay(selectedBay.id, { height: parseFloat(e.target.value) || 0 })}
                          className={cn(
                            "w-full border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500/50",
                            theme === 'dark' ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                          )}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Cars List in Bay */}
                  <div className="space-y-3 pt-4">
                    <div className="flex items-center justify-between">
                      <h2 className={cn(
                        "text-xs font-bold uppercase tracking-widest transition-colors duration-300",
                        theme === 'dark' ? "text-slate-500" : "text-slate-400"
                      )}>
                        Carros na Locação
                      </h2>
                      <div className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-bold transition-colors duration-300",
                        theme === 'dark' ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-100 text-emerald-700"
                      )}>
                        {carsInSelectedBay.length} / {selectedBay.capacity}
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      {carsInSelectedBay.length > 0 ? (
                        carsInSelectedBay.map(car => {
                          const isWrongSector = selectedBay.sector && car.sectorName !== selectedBay.sector;
                          return (
                          <div 
                            key={car.carId} 
                            className={cn(
                              "p-4 rounded-xl border flex items-center justify-between group transition-all duration-300",
                              theme === 'dark' ? "bg-slate-800/50 border-slate-700/50 hover:bg-slate-800" : "bg-white border-slate-200 hover:bg-slate-50 shadow-sm",
                              isWrongSector && (theme === 'dark' ? "border-fuchsia-500/50 bg-fuchsia-500/10" : "border-fuchsia-500 border bg-fuchsia-50")
                            )}
                          >
                            <div className="space-y-1">
                              <div className={cn(
                                "text-base font-bold flex items-center gap-2 transition-colors duration-300",
                                theme === 'dark' ? "text-white" : "text-slate-900"
                              )}>
                                {isWrongSector && <AlertCircle className="w-4 h-4 text-fuchsia-500" />}
                                {car.carId}
                                <span className={cn(
                                  "text-xs font-medium px-2 py-0.5 rounded transition-colors duration-300",
                                  theme === 'dark' ? "text-slate-500 bg-slate-900" : "text-slate-500 bg-slate-100"
                                )}>
                                  {car.model}
                                </span>
                              </div>
                              <div className="text-xs text-slate-400 flex items-center gap-1.5">
                                <Clock className="w-3 h-3" />
                                {car.embarkDate} {car.embarkTime}
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1.5">
                              <div className={cn(
                                "text-[10px] px-2 py-1 rounded font-bold uppercase",
                                car.status === 'EMBARCADO' ? "bg-blue-500/20 text-blue-400" : "bg-blue-100 text-blue-700"
                              )}>
                                {car.status}
                              </div>
                              {isWrongSector && (
                                <div className="text-[10px] font-bold text-fuchsia-500 bg-fuchsia-500/20 px-2 py-1 rounded">
                                  {car.sectorName} (Certo: {selectedBay.sector})
                                </div>
                              )}
                            </div>
                          </div>
                          );
                        })
                      ) : (
                        <div className={cn(
                          "py-8 text-center rounded-2xl border border-dashed transition-colors duration-300",
                          theme === 'dark' ? "bg-slate-800/20 border-slate-800" : "bg-slate-50 border-slate-200"
                        )}>
                          <Car className="w-6 h-6 text-slate-700 mx-auto mb-2" />
                          <p className="text-[10px] text-slate-600">Nenhum carro vinculado nesta locação</p>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div className={cn(
                  "h-full flex flex-col items-center justify-center text-center p-6 space-y-4 transition-colors duration-300",
                  theme === 'dark' ? "text-slate-600" : "text-slate-400"
                )}>
                  <div className={cn(
                    "p-4 rounded-full transition-colors duration-300",
                    theme === 'dark' ? "bg-slate-800" : "bg-slate-100"
                  )}>
                    <Box className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <p className={cn(
                      "text-sm font-medium transition-colors duration-300",
                      theme === 'dark' ? "text-slate-300" : "text-slate-600"
                    )}>
                      Nenhuma baia selecionada
                    </p>
                    <p className="text-xs text-slate-500">
                      {mode === 'edit' 
                        ? "Desenhe as locações no mapa." 
                        : "Selecione uma locação para ver os carros."}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className={cn(
              "p-4 border-t text-[10px] text-slate-500 flex justify-between items-center transition-colors duration-300",
              theme === 'dark' ? "border-slate-800" : "border-slate-200"
            )}>
              <span>v1.1.0</span>
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Base Sincronizada
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* --- Main Content Area --- */}
      <main className="flex-1 relative flex flex-col overflow-hidden">
        {mode === 'database' ? (
          <div className={cn(
            "flex-1 p-8 overflow-y-auto custom-scrollbar transition-colors duration-300",
            theme === 'dark' ? "bg-slate-950" : "bg-slate-50"
          )}>
            <div className="max-w-6xl mx-auto space-y-8">
              <div className="flex justify-between items-end">
                <div className="space-y-1">
                  <h1 className={cn(
                    "text-3xl font-black tracking-tight transition-colors duration-300",
                    theme === 'dark' ? "text-white" : "text-slate-900"
                  )}>
                    Base de Dados
                  </h1>
                  <p className="text-slate-400 text-sm">Gerencie os registros importados da planilha Excel.</p>
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setShowImport(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-blue-500 transition-all shadow-lg shadow-blue-900/20"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    Importar Excel
                  </button>
                </div>
              </div>

              <div className={cn(
                "rounded-3xl border overflow-hidden transition-all duration-300",
                theme === 'dark' ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200 shadow-xl"
              )}>
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className={cn(
                      "transition-colors duration-300",
                      theme === 'dark' ? "bg-slate-800/50 border-b border-slate-800" : "bg-slate-100 border-b border-slate-200"
                    )}>
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Carro</th>
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Modelo</th>
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Locação</th>
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Setor</th>
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Status</th>
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Embarque</th>
                    </tr>
                  </thead>
                  <tbody className={cn(
                    "divide-y transition-colors duration-300",
                    theme === 'dark' ? "divide-slate-800" : "divide-slate-100"
                  )}>
                    {dbRecords.map(record => (
                      <tr key={record.carId} className={cn(
                        "transition-colors duration-300",
                        theme === 'dark' ? "hover:bg-slate-800/30" : "hover:bg-slate-50"
                      )}>
                        <td className={cn(
                          "px-6 py-4 text-sm font-bold transition-colors duration-300",
                          theme === 'dark' ? "text-white" : "text-slate-900"
                        )}>
                          {record.carId}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-400">{record.model}</td>
                        <td className={cn(
                          "px-6 py-4 text-sm font-mono transition-colors duration-300",
                          theme === 'dark' ? "text-emerald-400" : "text-emerald-600"
                        )}>
                          {record.location}
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-500">{record.sectorName}</td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "px-2 py-1 rounded text-[10px] font-bold uppercase",
                            record.status === 'EMBARCADO' ? (theme === 'dark' ? "bg-blue-500/10 text-blue-400" : "bg-blue-100 text-blue-700") : (theme === 'dark' ? "bg-amber-500/10 text-amber-400" : "bg-amber-100 text-amber-700")
                          )}>
                            {record.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-500">{record.embarkDate} {record.embarkTime}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Header Overlay */}
            <div className="absolute top-6 left-6 right-6 z-10 flex justify-between items-center pointer-events-none">
              {!sidebarOpen && (
                <button 
                  onClick={() => setSidebarOpen(true)}
                  className={cn(
                    "p-3 backdrop-blur-md border rounded-xl pointer-events-auto transition-all shadow-xl",
                    theme === 'dark' ? "bg-slate-900/80 border-slate-700 hover:bg-slate-800" : "bg-white/80 border-slate-200 hover:bg-slate-50"
                  )}
                >
                  <ChevronRight className={cn("w-5 h-5", theme === 'dark' ? "text-emerald-400" : "text-emerald-600")} />
                </button>
              )}
              
              <div className="flex gap-3 pointer-events-auto">
                <div className={cn(
                  "px-4 py-2 backdrop-blur-xl border rounded-xl flex items-center gap-3 shadow-2xl h-10 transition-all duration-300",
                  theme === 'dark' 
                    ? "bg-slate-900/80 border-slate-700 shadow-black/20" 
                    : "bg-white/90 border-slate-200/60 shadow-slate-200/50"
                )}>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className={cn(
                      "text-xs font-bold uppercase tracking-wider transition-colors duration-300",
                      theme === 'dark' ? "text-slate-300" : "text-slate-700"
                    )}>
                      Monitoramento
                    </span>
                  </div>
                  <div className={cn(
                    "w-px h-4 transition-colors duration-300",
                    theme === 'dark' ? "bg-slate-700" : "bg-slate-200"
                  )} />
                  <div className={cn(
                    "text-xs font-medium transition-colors duration-300",
                    theme === 'dark' ? "text-slate-400" : "text-slate-500"
                  )}>
                    {dbRecords.length}
                  </div>
                </div>

                {/* Filters */}
                <div className={cn(
                  "px-3 py-1.5 backdrop-blur-xl border rounded-xl flex items-center gap-3 h-11 shadow-2xl transition-all duration-300",
                  theme === 'dark' 
                    ? "bg-slate-900/80 border-slate-700 shadow-black/20" 
                    : "bg-white/90 border-slate-200/60 shadow-slate-200/50"
                )}>
                  <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-slate-500/10 border border-slate-500/10">
                    <Search className="w-3.5 h-3.5 text-slate-500" />
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest hidden sm:inline">Filtros</span>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    {/* CarID Input */}
                    <div className="relative group">
                      <input 
                        type="text"
                        placeholder="Buscar Placa/Carro..."
                        value={filterCarId}
                        onChange={e => setFilterCarId(e.target.value)}
                        className={cn(
                          "w-48 text-[11px] font-bold bg-transparent border-b border-transparent focus:border-emerald-500 focus:outline-none transition-all placeholder:text-slate-500 placeholder:font-medium py-0.5",
                          theme === 'dark' ? "text-slate-200" : "text-slate-700"
                        )}
                      />
                    </div>

                    <div className="w-px h-4 bg-slate-500/20" />

                    {/* Setor Filter */}
                    <select 
                      value={filterSector} 
                      onChange={e => setFilterSector(e.target.value)}
                      className={cn(
                        "text-[11px] font-bold bg-transparent focus:outline-none appearance-none cursor-pointer hover:text-emerald-500 transition-colors",
                        theme === 'dark' ? "text-slate-300" : "text-slate-700"
                      )}
                    >
                      <option value="ALL">Todos os Setores</option>
                      {availableSectors.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>

                    <div className="w-px h-4 bg-slate-500/20" />
                    
                    {/* Model Filter */}
                    <select 
                      value={filterModel} 
                      onChange={e => setFilterModel(e.target.value)}
                      className={cn(
                        "text-[11px] font-bold bg-transparent focus:outline-none appearance-none cursor-pointer hover:text-emerald-500 transition-colors",
                        theme === 'dark' ? "text-slate-300" : "text-slate-700"
                      )}
                    >
                      <option value="ALL">Todos os Modelos</option>
                      {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>

                    <div className="w-px h-4 bg-slate-500/20" />
                    
                    {/* SLA Filter */}
                    <select 
                      value={filterStatus} 
                      onChange={e => setFilterStatus(e.target.value)}
                      className={cn(
                        "text-[11px] font-bold bg-transparent focus:outline-none appearance-none cursor-pointer hover:text-emerald-500 transition-colors",
                        theme === 'dark' ? "text-slate-300" : "text-slate-700"
                      )}
                    >
                      <option value="ALL">Qualquer SLA</option>
                      <option value="LATE">Atrasado</option>
                      <option value="NEXT">Próx. Embarque</option>
                      <option value="ONTIME">No Prazo</option>
                    </select>

                    <div className="w-px h-4 bg-slate-500/20" />

                    {/* Excel Status Filter */}
                    <select 
                      value={filterExcelStatus} 
                      onChange={e => setFilterExcelStatus(e.target.value)}
                      className={cn(
                        "text-[11px] font-bold bg-transparent focus:outline-none appearance-none cursor-pointer pr-1 hover:text-emerald-500 transition-colors",
                        theme === 'dark' ? "text-slate-300" : "text-slate-700"
                      )}
                    >
                      <option value="ALL">Situação Original</option>
                      {availableExcelStatuses.map(st => <option key={st} value={st}>{st}</option>)}
                    </select>
                  </div>

                  {/* Clear Filters Button */}
                  {(filterSector !== 'ALL' || filterModel !== 'ALL' || filterStatus !== 'ALL' || filterExcelStatus !== 'ALL' || filterCarId !== '') && (
                     <button
                       onClick={() => {
                         setFilterSector('ALL');
                         setFilterModel('ALL');
                         setFilterStatus('ALL');
                         setFilterExcelStatus('ALL');
                         setFilterCarId('');
                       }}
                       className="p-1 px-2 hover:bg-rose-500/10 text-rose-500 rounded-lg text-[10px] font-black uppercase transition-all flex items-center gap-1.5 whitespace-nowrap"
                     >
                       <X className="w-3 h-3" />
                       Limpar
                     </button>
                  )}
                </div>
              </div>

              <div className="flex gap-2 pointer-events-auto">
                <div className={cn(
                  "px-4 py-2 backdrop-blur-md border rounded-xl flex items-center gap-3 shadow-xl transition-all duration-300",
                  theme === 'dark' 
                    ? (autoRefresh ? "bg-slate-900/80 border-emerald-500/50" : "bg-slate-900/80 border-slate-700") 
                    : (autoRefresh ? "bg-white/80 border-emerald-500/50" : "bg-white/80 border-slate-200")
                )}>
                  <button 
                    onClick={() => setAutoRefresh(!autoRefresh)}
                    className="flex items-center gap-2"
                  >
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      autoRefresh ? "bg-emerald-500 animate-pulse" : "bg-slate-600"
                    )} />
                    <span className={cn(
                      "text-[10px] font-bold uppercase tracking-wider transition-colors duration-300",
                      theme === 'dark' ? "text-slate-300" : "text-slate-700"
                    )}>
                      Auto-Refresh {autoRefresh ? 'ON' : 'OFF'}
                    </span>
                  </button>
                  {autoRefresh && (
                    <div className="text-[9px] text-slate-500 font-mono">
                      {lastUpdate.toLocaleTimeString()}
                    </div>
                  )}
                </div>
                
                <button 
                  onClick={() => fetchData()}
                  className="p-2 bg-slate-900/80 backdrop-blur-md border border-slate-700 rounded-xl hover:bg-slate-800 transition-all shadow-xl text-slate-400"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Map Container */}
            <div 
              className={cn(
                "flex-1 relative overflow-auto custom-scrollbar p-10 transition-colors duration-500",
                theme === 'dark' 
                  ? "bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black" 
                  : "bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-slate-50 to-slate-200",
                mode === 'edit' ? "cursor-crosshair" : "cursor-default"
              )}
            >
              <div
                className={cn(
                  "inline-block relative shadow-2xl rounded-2xl overflow-hidden backdrop-blur-3xl transition-all duration-500",
                  theme === 'dark' 
                    ? "border-slate-700/40 ring-1 ring-white/5" 
                    : "border-slate-200/80 ring-1 ring-black/5 shadow-slate-300/40 border"
                )}
                style={{ minWidth: 'min-content' }}
              >
                <div 
                  ref={containerRef}
                  className="relative origin-top-left"
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  style={{ 
                    aspectRatio: '16/9', 
                    width: '3200px', // Increased space for expansion
                    backgroundImage: mode === 'edit' 
                      ? `linear-gradient(to right, ${theme === 'dark' ? '#1e293b' : '#e2e8f0'} 1px, transparent 1px), 
                         linear-gradient(to bottom, ${theme === 'dark' ? '#1e293b' : '#e2e8f0'} 1px, transparent 1px), 
                         url(${DEFAULT_IMAGE})`
                      : `url(${DEFAULT_IMAGE})`,
                    backgroundSize: mode === 'edit' ? '2% 3.55%, 100% 100%' : '100% 100%',
                    backgroundRepeat: 'repeat, no-repeat',
                    backgroundPosition: 'center',
                    backgroundColor: theme === 'dark' ? '#0f172a' : '#f8fafc'
                  }}
                >
                {/* Interactive Overlay */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" style={{ zIndex: 10 }}>
                  {/* Visual Scale Ruler */}
                  {(isDrawing || isResizing) && (
                    <g className="opacity-50">
                      {/* Horizontal Ruler (Top) */}
                      {Array.from({ length: 21 }).map((_, i) => {
                        const x = i * 5;
                        return (
                          <g key={`hx-${x}`}>
                            <line 
                              x1={`${x}%`} y1="0" x2={`${x}%`} y2="1.5%" 
                              className="stroke-white stroke-[0.5]" 
                            />
                            {i % 2 === 0 && (
                              <text 
                                x={`${x}%`} y="3%" 
                                className="fill-white text-[8px] font-mono" 
                                textAnchor="middle"
                              >
                                {x}%
                              </text>
                            )}
                          </g>
                        );
                      })}
                      {/* Vertical Ruler (Left) */}
                      {Array.from({ length: 21 }).map((_, i) => {
                        const y = i * 5;
                        return (
                          <g key={`vy-${y}`}>
                            <line 
                              x1="0" y1={`${y}%`} x2="1.5%" y2={`${y}%`} 
                              className="stroke-white stroke-[0.5]" 
                            />
                            {i % 2 === 0 && (
                              <text 
                                x="2%" y={`${y}%`} 
                                className="fill-white text-[8px] font-mono" 
                                alignmentBaseline="middle"
                              >
                                {y}%
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </g>
                  )}

                  {bays.map(bay => {
                    const isSelected = selectedBayId === bay.id;
                    const carsInBay = dbRecords
                      .filter(r => r.location === bay.name)
                      .sort((a, b) => {
                        const dateA = parseExcelDate(a.embarkDate, a.embarkTime);
                        const dateB = parseExcelDate(b.embarkDate, b.embarkTime);
                        if (!dateA && !dateB) return 0;
                        if (!dateA) return 1;
                        if (!dateB) return -1;
                        return dateA.getTime() - dateB.getTime();
                      });

                    const occupancyRatio = carsInBay.length / bay.capacity;
                    const displayBay = (isSelected && tempBay) ? tempBay : bay;
                    
                    let color = 'emerald';
                    if (occupancyRatio >= 1) color = 'rose';
                    else if (occupancyRatio > 0.5) color = 'amber';

                    return (
                      <g 
                        key={bay.id} 
                        className={cn(
                          "pointer-events-auto cursor-pointer group",
                          (isDragging || isResizing || isDrawing) && "pointer-events-none"
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedBayId(bay.id);
                        }}
                      >
                        <rect
                          x={`${displayBay.x}%`}
                          y={`${displayBay.y}%`}
                          width={`${displayBay.width}%`}
                          height={`${displayBay.height}%`}
                          className={cn(
                            "transition-all duration-300",
                            isSelected ? "stroke-2" : "stroke-0", // No stroke by default
                            "fill-transparent",
                            isSelected && (theme === 'dark' ? "fill-white/5 stroke-white" : "fill-emerald-500/5 stroke-emerald-500")
                          )}
                        />
                        <foreignObject
                          x={`${displayBay.x}%`}
                          y={`${displayBay.y}%`}
                          width={`${displayBay.width}%`}
                          height={`${displayBay.height}%`}
                        >
                          <div className="w-full h-full flex flex-col items-center justify-start p-1 overflow-hidden">
                            <div className="flex flex-col items-center justify-center py-1.5 w-full">
                              <div className={cn(
                                "text-[12px] font-black uppercase tracking-tight truncate w-full text-center transition-colors duration-300",
                                isSelected 
                                  ? (theme === 'dark' ? "text-white" : "text-emerald-700") 
                                  : (theme === 'dark' ? "text-slate-300" : "text-slate-600")
                              )}>
                                {displayBay.name}
                              </div>
                              <div className={cn(
                                "text-[9px] font-bold uppercase tracking-widest truncate w-full text-center leading-none opacity-60",
                                isSelected ? "text-emerald-400" : (theme === 'dark' ? "text-slate-500" : "text-slate-400")
                              )}>
                                {displayBay.sector || 'Sem Setor'}
                              </div>
                            </div>

                            {/* Ruler / Capacity Indicator (Vertical Slots) */}
                            <div className={cn(
                              "flex-1 w-full flex flex-col mt-0.5 rounded-sm overflow-y-auto custom-scrollbar mb-1 relative transition-colors duration-300",
                              theme === 'dark' 
                                ? "bg-transparent" 
                                : "bg-transparent"
                            )}>
                              {Array.from({ length: Math.max(displayBay.capacity, carsInBay.length) }).map((_, i, arr) => {
                                const totalSlots = arr.length;
                                const isOverflow = i >= displayBay.capacity; // Slots extras além da capacidade física
                                const carIndex = i; // Stack from top down
                                const car = carsInBay[carIndex];
                                
                                // Checking Filters
                                let isVisible = true;
                                let slaInfo = car ? getSlaStatus(car) : null;
                                
                                if (car) {
                                  if (filterModel !== 'ALL' && car.model !== filterModel) isVisible = false;
                                  if (filterSector !== 'ALL' && car.sectorName !== filterSector) isVisible = false;
                                  if (filterExcelStatus !== 'ALL' && car.status !== filterExcelStatus) isVisible = false;
                                  if (filterCarId !== '' && !car.carId.toLowerCase().includes(filterCarId.toLowerCase())) isVisible = false;
                                  if (filterStatus !== 'ALL') {
                                    if (filterStatus === 'LATE' && !slaInfo?.isLate) isVisible = false;
                                    if (filterStatus === 'NEXT' && slaInfo?.text !== 'PRÓX. EMB.') isVisible = false;
                                    if (filterStatus === 'ONTIME' && slaInfo?.text !== 'NO PRAZO') isVisible = false;
                                  }
                                }
                                
                                const isWrongSector = car && displayBay.sector && car.sectorName !== displayBay.sector;
                                
                                return (
                                  <div 
                                    key={i}
                                    style={{ 
                                      height: displayBay.slotHeight ? `${displayBay.slotHeight}px` : `28px`,
                                      minHeight: displayBay.slotHeight ? `${displayBay.slotHeight}px` : `28px` 
                                    }}
                                    className={cn(
                                      "w-full flex items-center px-1.5 gap-1.5 mb-[3px] shrink-0",
                                      isOverflow && "bg-rose-950/40 border border-rose-500/40 border-dashed rounded-sm",
                                      !isVisible && "opacity-20 saturate-0" 
                                    )}
                                  >
                                    <span className={cn(
                                      "text-[8px] font-bold w-4 text-right shrink-0 drop-shadow-md",
                                      isOverflow ? "text-rose-400" : "text-slate-500"
                                    )}>
                                      {i + 1}
                                    </span>
                                    <div className={cn(
                                      "flex-1 h-full rounded-[4px] transition-all duration-300 overflow-hidden shadow-sm border",
                                      car 
                                        ? (theme === 'dark'
                                            ? (isWrongSector ? "bg-gradient-to-r from-fuchsia-600/90 to-purple-600/90 border-fuchsia-500/50" : color === 'rose' ? "bg-gradient-to-r from-rose-600/90 to-red-600/90 border-rose-500/50" : color === 'amber' ? "bg-gradient-to-r from-amber-600/90 to-orange-500/90 border-amber-500/50" : "bg-gradient-to-r from-emerald-600/90 to-teal-500/90 border-emerald-500/50")
                                            : (isWrongSector ? "bg-gradient-to-r from-fuchsia-500 to-purple-500 border-fuchsia-400" : color === 'rose' ? "bg-gradient-to-r from-rose-500 to-red-500 border-rose-400" : color === 'amber' ? "bg-gradient-to-r from-amber-400 to-orange-400 border-amber-300" : "bg-gradient-to-r from-emerald-500 to-teal-500 border-emerald-400")
                                          )
                                        : "bg-transparent border-transparent", // Clean empty slots
                                      car && "hover:scale-[1.03] hover:shadow-lg hover:z-10 hover:brightness-110 cursor-help"
                                    )}
                                    onMouseEnter={(e) => {
                                      if (car) {
                                        setHoveredCar({ car, x: e.clientX, y: e.clientY });
                                      }
                                    }}
                                    onMouseMove={(e) => {
                                      if (car) {
                                        setHoveredCar({ car, x: e.clientX, y: e.clientY });
                                      }
                                    }}
                                    onMouseLeave={() => setHoveredCar(null)}
                                    >
                                      {car && (
                                        <div className="w-full h-full flex flex-row items-center justify-between px-1.5 gap-1">
                                          <div className="flex items-center gap-1.5 min-w-0">
                                            {isWrongSector ? (
                                              <AlertTriangle className="w-3 h-3 text-white animate-pulse shrink-0" />
                                            ) : slaInfo?.isLate ? (
                                              <Clock className="w-3 h-3 text-white/80 shrink-0" />
                                            ) : (
                                              <div className="w-1.5 h-1.5 rounded-full bg-white/40 shrink-0" />
                                            )}
                                            <span className={cn("font-black text-white leading-none truncate drop-shadow-sm text-[10px]")}>
                                              {car.carId}
                                            </span>
                                          </div>
                                          
                                          {/* SLA & Time Indicator */}
                                          {(!displayBay.slotHeight || displayBay.slotHeight >= 20) && (
                                            <div className="flex items-center gap-1.5 shrink-0">
                                              <span className="text-[9px] text-white/90 font-bold tracking-tight truncate drop-shadow-sm">
                                                {car.embarkTime}
                                              </span>
                                              {(() => {
                                                const sla = slaInfo || getSlaStatus(car);
                                                return (
                                                  <div className={cn("px-1.5 py-[2px] rounded-[3px] text-[7px] font-black text-white uppercase whitespace-nowrap shadow-sm border border-white/20 backdrop-blur-sm", sla.color)}>
                                                    {sla.text}
                                                  </div>
                                                );
                                              })()}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            
                            {(isResizing || isDrawing) && isSelected && (
                              <div className="absolute top-0 right-0 transform translate-x-full bg-blue-600 text-white text-[7px] px-1 rounded font-bold animate-pulse z-50">
                                {displayBay.capacity} VAGAS
                              </div>
                            )}
                          </div>
                        </foreignObject>
                        
                        {isSelected && mode === 'edit' && (
                          <rect
                            x={`${displayBay.x + displayBay.width - 2}%`}
                            y={`${displayBay.y + displayBay.height - 2}%`}
                            width="2%"
                            height="2%"
                            className="fill-white stroke-blue-500 stroke-[0.5] cursor-nwse-resize hover:fill-blue-500 transition-colors pointer-events-auto"
                          />
                        )}
                      </g>
                    );
                  })}

                  {currentRect && (
                    <g>
                      <rect
                        x={`${currentRect.x}%`}
                        y={`${currentRect.y}%`}
                        width={`${currentRect.w}%`}
                        height={`${currentRect.h}%`}
                        className="fill-emerald-500/20 stroke-emerald-500 stroke-2 stroke-dasharray-[4,4] animate-[dash_1s_linear_infinite]"
                      />
                      <foreignObject
                        x={`${currentRect.x}%`}
                        y={`${currentRect.y}%`}
                        width={`${currentRect.w}%`}
                        height={`${currentRect.h}%`}
                      >
                        <div className="w-full h-full flex items-center justify-center">
                          <div className="bg-emerald-600 text-white text-[8px] px-1.5 py-0.5 rounded font-bold shadow-lg">
                            {Math.max(1, Math.floor(currentRect.h / 2.5))} VAGAS
                          </div>
                        </div>
                      </foreignObject>
                    </g>
                  )}
                </svg>
              </div>
            </div>

            {/* Hover Tooltip */}
            <AnimatePresence>
                {hoveredCar && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={cn(
                      "fixed z-[100] pointer-events-none p-3 rounded-xl border shadow-2xl backdrop-blur-md transition-colors duration-300",
                      theme === 'dark' ? "bg-slate-900/90 border-slate-700" : "bg-white/90 border-slate-200"
                    )}
                    style={{ 
                      left: hoveredCar.x + 15, 
                      top: hoveredCar.y + 15,
                      minWidth: '180px'
                    }}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between border-b border-slate-700/30 pb-1.5 mb-1.5">
                        <span className={cn(
                          "text-[10px] font-black uppercase tracking-widest",
                          theme === 'dark' ? "text-emerald-400" : "text-emerald-600"
                        )}>
                          Informações do Carro
                        </span>
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      </div>
                      
                      <div className="grid grid-cols-1 gap-1.5">
                        {[
                          { id: 'carId', label: 'ID', icon: <Hash className="w-3 h-3" /> },
                          { id: 'model', label: 'Modelo', icon: <Box className="w-3 h-3" /> },
                          { id: 'status', label: 'Status', icon: <Activity className="w-3 h-3" /> },
                          { id: 'sectorName', label: 'Setor', icon: <MapPin className="w-3 h-3" /> },
                          { id: 'embarkDate', label: 'Data', icon: <Calendar className="w-3 h-3" /> },
                          { id: 'embarkTime', label: 'Hora', icon: <Clock className="w-3 h-3" /> },
                          { id: 'carPhysical', label: 'Físico', icon: <Truck className="w-3 h-3" /> },
                          { id: 'sectorId', label: 'ID Setor', icon: <Database className="w-3 h-3" /> },
                        ].filter(f => hoverConfig[f.id]).map(field => (
                          <div key={field.id} className="flex items-start gap-2">
                            <div className="mt-0.5 text-slate-500">
                              {field.icon}
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[8px] font-bold text-slate-500 uppercase tracking-tighter leading-none mb-0.5">
                                {field.label}
                              </span>
                              <span className={cn(
                                "text-[10px] font-bold transition-colors duration-300",
                                theme === 'dark' ? "text-white" : "text-slate-900"
                              )}>
                                {(hoveredCar.car as any)[field.id] || '---'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </>
        )}

        {/* Import Modal */}
        <AnimatePresence>
          {showImport && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowImport(false)}
                className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className={cn(
                  "relative w-full max-w-2xl border rounded-3xl shadow-2xl overflow-hidden transition-colors duration-300",
                  theme === 'dark' ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
                )}
              >
                <div className={cn(
                  "p-6 border-b flex justify-between items-center transition-colors duration-300",
                  theme === 'dark' ? "border-slate-800" : "border-slate-100"
                )}>
                  <div className="flex items-center gap-3">
                    <FileSpreadsheet className="w-5 h-5 text-blue-400" />
                    <h2 className={cn(
                      "text-lg font-bold transition-colors duration-300",
                      theme === 'dark' ? "text-white" : "text-slate-900"
                    )}>
                      Importar Dados do Excel
                    </h2>
                  </div>
                  <button onClick={() => setShowImport(false)} className="text-slate-500 hover:text-rose-500 transition-colors">
                    <Plus className="w-6 h-6 rotate-45" />
                  </button>
                </div>
                <div className="p-6 space-y-4">
                  <p className="text-sm text-slate-400">
                    Copie os dados da sua planilha (incluindo o cabeçalho) e cole abaixo. 
                    O sistema espera colunas separadas por TAB (padrão do Excel).
                  </p>
                  <textarea 
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    className={cn(
                      "w-full h-64 border rounded-2xl p-4 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none transition-colors duration-300",
                      theme === 'dark' ? "bg-slate-950 border-slate-800 text-slate-300" : "bg-slate-50 border-slate-200 text-slate-700"
                    )}
                    placeholder="Cole aqui os dados da planilha..."
                  />
                  <div className="flex justify-end gap-3">
                    <button 
                      onClick={() => setShowImport(false)}
                      className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-rose-500 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button 
                      onClick={handleImport}
                      className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-500 transition-all"
                    >
                      Processar Dados
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Clear Map Confirmation Modal */}
        <AnimatePresence>
          {showClearConfirm && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowClearConfirm(false)}
                className="absolute inset-0 bg-slate-950/90 backdrop-blur-md"
              />
              <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className={cn(
                  "relative w-full max-w-md border rounded-3xl shadow-2xl p-8 text-center space-y-6 transition-colors duration-300",
                  theme === 'dark' ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
                )}
              >
                <div className="w-20 h-20 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto">
                  <Trash2 className="w-10 h-10 text-rose-500" />
                </div>
                <div className="space-y-2">
                  <h2 className={cn(
                    "text-2xl font-black tracking-tight transition-colors duration-300",
                    theme === 'dark' ? "text-white" : "text-slate-900"
                  )}>
                    Limpar Mapa?
                  </h2>
                  <p className="text-slate-400 text-sm">
                    Esta ação irá excluir permanentemente todas as baias desenhadas no mapa. Os dados da planilha não serão afetados.
                  </p>
                </div>
                <div className="flex flex-col gap-3 pt-4">
                  <button 
                    onClick={() => {
                      saveBays([]);
                      setSelectedBayId(null);
                      setShowClearConfirm(false);
                    }}
                    className="w-full py-4 bg-rose-600 text-white rounded-2xl font-black text-sm hover:bg-rose-500 transition-all shadow-lg shadow-rose-900/20 uppercase tracking-widest"
                  >
                    Sim, Limpar Tudo
                  </button>
                  <button 
                    onClick={() => setShowClearConfirm(false)}
                    className={cn(
                      "w-full py-4 rounded-2xl font-bold text-sm transition-all uppercase tracking-widest",
                      theme === 'dark' ? "bg-slate-800 text-slate-300 hover:bg-slate-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    )}
                  >
                    Cancelar
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>

      <style>{`
        @keyframes dash {
          to {
            stroke-dashoffset: -8;
          }
        }
      `}</style>
    </div>
  );
}
