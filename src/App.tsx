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
  X,
  PieChart,
  BarChart3,
  TrendingUp,
  LayoutDashboard,
  Users,
  Filter,
  MonitorPlay,
  MonitorPause
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
  orientation?: 'vertical' | 'horizontal'; // Orientation of the car slots
  tabGroup?: 'geral' | 'format'; // Tab group for separation
}

type Mode = 'view' | 'edit' | 'database' | 'dashboard';

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

function getLocationCategory(location: string): string {
  if (!location) return 'Indefinido';
  const loc = location.toUpperCase().trim();
  if (loc.startsWith('PICK')) return 'Picking (Geral)';
  if (loc.startsWith('EXP')) return 'Expedição';
  if (loc.startsWith('PK')) return 'Picking (Format. Carro)';
  if (loc.startsWith('DEP-D')) return 'Picking (DCC II)';
  if (loc.startsWith('MIUD')) return 'Picking (Miúdo)';
  if (loc.startsWith('SFA')) return 'Picking (Sala de Faixa)';
  return 'Controlador';
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
  const [filterController, setFilterController] = useState<string>('ALL');
  const [filterDate, setFilterDate] = useState<string>('ALL');
  const [filterTime, setFilterTime] = useState<string>('ALL');
  const [filterCarId, setFilterCarId] = useState<string>('');
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [controllerPageIndex, setControllerPageIndex] = useState(0);
  const [activeTabGroup, setActiveTabGroup] = useState<'geral' | 'format'>('geral');
  const [isPresentationMode, setIsPresentationMode] = useState(false);
  const [presentationSpeed, setPresentationSpeed] = useState(0.05);
  const scrollDirection = useRef<1 | -1>(1);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // --- Filtered Data ---
  const filteredRecords = useMemo(() => {
    return dbRecords.filter(r => {
      const matchModel = filterModel === 'ALL' || r.model === filterModel;
      const matchSector = filterSector === 'ALL' || r.sectorName === filterSector;
      const matchExcelStatus = filterExcelStatus === 'ALL' || r.status === filterExcelStatus;
      const matchController = filterController === 'ALL' || r.location === filterController;
      const matchDate = filterDate === 'ALL' || r.embarkDate === filterDate;
      const matchTime = filterTime === 'ALL' || r.embarkTime === filterTime;
      const matchCarId = !filterCarId || r.carId.toLowerCase().includes(filterCarId.toLowerCase());
      
      const sla = getSlaStatus(r);
      const matchStatus = filterStatus === 'ALL' || 
        (filterStatus === 'LATE' && sla.isLate) ||
        (filterStatus === 'NEXT' && sla.text === 'PRÓX. EMB.') ||
        (filterStatus === 'ONTIME' && sla.text === 'NO PRAZO');

      return matchModel && matchSector && matchStatus && matchExcelStatus && matchCarId && 
             matchController && matchDate && matchTime;
    });
  }, [dbRecords, filterModel, filterSector, filterStatus, filterExcelStatus, filterCarId, filterController, filterDate, filterTime]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Presentation Mode Auto-scroll
  useEffect(() => {
    if (!isPresentationMode) return;
    let animationFrameId: number;
    let lastTime = performance.now();
    let currentScroll = scrollContainerRef.current?.scrollLeft ?? 0;

    const scrollStep = (currentTime: number) => {
      const dt = Math.min(currentTime - lastTime, 32); // cap at 32ms to avoid huge jumps on tab focus
      lastTime = currentTime;

      const el = scrollContainerRef.current;
      if (el && !isDragging) {
        const { scrollWidth, clientWidth } = el;
        const maxScroll = scrollWidth - clientWidth;

        if (scrollDirection.current === 1 && currentScroll >= maxScroll - 1) {
          scrollDirection.current = -1;
        } else if (scrollDirection.current === -1 && currentScroll <= 1) {
          scrollDirection.current = 1;
        }

        currentScroll = Math.max(0, Math.min(maxScroll, currentScroll + presentationSpeed * dt * scrollDirection.current));
        el.scrollLeft = currentScroll;
      }
      // Only schedule next frame if still in presentation mode
      animationFrameId = requestAnimationFrame(scrollStep);
    };

    animationFrameId = requestAnimationFrame(scrollStep);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isPresentationMode, isDragging, presentationSpeed]);

  const fetchData = async () => {
    try {
      // 1. Try the new Sync API (where VBA pushes data + Layout)
      const syncResponse = await fetch('/api/sync');
      if (syncResponse.ok) {
        const syncData = await syncResponse.json();
        
        // Atualizar Carros
        if (syncData.records && syncData.records.length > 0) {
          const newRecords = dataService.importJSON(syncData.records);
          setDbRecords([...newRecords]);
          setLastUpdate(new Date());
        }

        // Atualizar Layout (Baias)
        if (syncData.bays && syncData.bays.length > 0) {
          // Só atualizamos se as baias atuais estiverem vazias ou se for o primeiro carregamento
          // Para evitar sobrescrever edições locais em progresso (opcional: adicionar timestamp)
          setBays(syncData.bays);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(syncData.bays));
        }

        if (syncData.records && syncData.records.length > 0) return; 
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

          // Sincronizar com outros clientes
          fetch('/api/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ records: data.records })
          }).catch(console.error);
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
    // Primeiro tenta carregar do LocalStorage (Rápido)
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setBays(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load bays', e);
      }
    }
    // Depois busca na nuvem (Global)
    fetchData();
  }, []);

  // Save data
  const saveBays = async (newBays: Bay[]) => {
    try {
      setBays(newBays);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newBays));
      
      // Sincronizar com o servidor (Global)
      await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bays: newBays })
      });
    } catch (e) {
      console.error('Failed to save bays', e);
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

  const availableControllers = useMemo(() => {
    return Array.from(new Set(
      dbRecords
        .filter(r => getLocationCategory(r.location) === 'Controlador')
        .map(r => r.location)
        .filter(Boolean)
    )).sort((a, b) => String(a).localeCompare(String(b)));
  }, [dbRecords]);

  const availableDates = useMemo(() => {
    return Array.from(new Set(dbRecords.map(r => r.embarkDate).filter(Boolean))).sort((a, b) => {
      const parseDate = (d: string) => {
        const parts = d.split('/');
        if (parts.length < 3) return 0;
        const [day, month, year] = parts.map(Number);
        return new Date(year, month - 1, day).getTime();
      };
      return parseDate(b as string) - parseDate(a as string); // Newest first
    });
  }, [dbRecords]);

  const availableTimes = useMemo(() => {
    return Array.from(new Set(dbRecords.map(r => r.embarkTime).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b)));
  }, [dbRecords]);

  const selectedBay = useMemo(() => bays.find(b => b.id === selectedBayId), [bays, selectedBayId]);

  // Cars in selected bay
  const carsInSelectedBay = useMemo(() => {
    if (!selectedBay) return [];
    return dbRecords.filter(r => r.location === selectedBay.name);
  }, [selectedBay, dbRecords]);

  // --- PERFORMANCE: Pre-group all cars by location (O(n) once, instead of O(bays×n) per render) ---
  const carsByLocation = useMemo(() => {
    const map: Record<string, CarRecord[]> = {};
    dbRecords.forEach(r => {
      const loc = r.location;
      if (!loc) return;
      if (!map[loc]) map[loc] = [];
      map[loc].push(r);
    });
    return map;
  }, [dbRecords]);

  // --- PERFORMANCE: Pre-calculate SLA status for every car (O(n) once) ---
  const slaByCarId = useMemo(() => {
    const map: Record<string, ReturnType<typeof getSlaStatus>> = {};
    dbRecords.forEach(r => {
      map[r.carId] = getSlaStatus(r);
    });
    return map;
  }, [dbRecords]);

  // --- PERFORMANCE: Pre-sort cars per location by embark time (O(n log n) once per dbRecords change) ---
  const sortedCarsByLocation = useMemo(() => {
    const map: Record<string, CarRecord[]> = {};
    Object.keys(carsByLocation).forEach(loc => {
      map[loc] = carsByLocation[loc].slice().sort((a, b) => {
        const dateA = parseExcelDate(a.embarkDate, a.embarkTime);
        const dateB = parseExcelDate(b.embarkDate, b.embarkTime);
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateA.getTime() - dateB.getTime();
      });
    });
    return map;
  }, [carsByLocation]);

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
      "flex h-screen w-screen font-sans overflow-hidden transition-colors duration-500 relative",
      theme === 'dark' 
        ? "bg-slate-950 text-slate-200" 
        : "bg-sky-50 text-slate-900"
    )}>
      {/* Mobile Backdrop */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>
      {/* --- Sidebar --- */}
      <AnimatePresence mode="wait">
        {sidebarOpen && (
          <motion.aside
            initial={{ x: -450 }}
            animate={{ x: 0 }}
            exit={{ x: -450 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className={cn(
              "w-[320px] xs:w-[380px] sm:w-[420px] shrink-0 h-full border-r flex flex-col z-50 shadow-2xl transition-[background-color,border-color] duration-300",
              "fixed lg:relative inset-y-0 left-0",
              theme === 'dark' 
                ? "bg-slate-900 border-slate-800" 
                : "bg-white/80 backdrop-blur-md border-r border-blue-100 shadow-xl shadow-blue-900/5"
            )}
          >
            <div className={cn(
              "p-8 border-b flex flex-col gap-6 transition-colors duration-300 relative overflow-hidden",
              theme === 'dark' ? "border-white/5" : "border-slate-200"
            )}>
              {/* Decorative background glow for sidebar header */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 blur-[60px] rounded-full -mr-16 -mt-16" />
              
              <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-12 h-12 rounded-2xl overflow-hidden flex items-center justify-center border shadow-xl transition-all duration-300",
                    theme === 'dark' 
                      ? "bg-white/10 border-white/20 backdrop-blur-md glow-indigo" 
                      : "bg-white border-slate-100 shadow-slate-200/50"
                  )}>
                    <img src={LOGO_URL} alt="Logo" className="w-8 h-8 object-contain" referrerPolicy="no-referrer" />
                  </div>
                  <div className="flex flex-col justify-center">
                    <h1 className={cn(
                      "font-black text-xl tracking-tighter leading-none transition-colors duration-300",
                      theme === 'dark' ? "text-white" : "text-slate-900"
                    )}>
                      Controle
                    </h1>
                    <h1 className="font-black text-xl tracking-tighter leading-none text-emerald-500 mt-1">
                      DCC
                    </h1>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                    className={cn(
                      "p-2.5 rounded-xl transition-all duration-300 hover:scale-110 active:scale-95",
                      theme === 'dark' 
                        ? "bg-white/5 hover:bg-white/10 text-amber-400 border border-white/10" 
                        : "bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200"
                    )}
                  >
                    {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                  </button>
                  <button 
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      "p-2.5 rounded-xl transition-all hover:scale-110 active:scale-95 group/collapse",
                      theme === 'dark' ? "bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/10" : "bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 border border-slate-200"
                    )}
                    title="Retrair Painel"
                  >
                    <ChevronLeft className="w-5 h-5 group-hover/collapse:-translate-x-0.5 transition-transform" />
                  </button>
                </div>
              </div>
            </div>
                       <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
              {/* Navigation Group */}
              <div className="space-y-3">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] pl-2">Navegação</span>
                
                <div className={cn(
                  "p-1.5 rounded-[1.5rem] flex flex-col gap-1 transition-all duration-300",
                  theme === 'dark' ? "bg-black/40 border border-white/5 shadow-inner" : "bg-slate-200/40 border border-slate-200/60"
                )}>
                  <button
                    onClick={() => setMode('dashboard')}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-black transition-all",
                      mode === 'dashboard' 
                        ? (theme === 'dark' ? "bg-white/10 text-white shadow-lg shadow-black/20 ring-1 ring-white/10" : "bg-white text-slate-900 shadow-md") 
                        : (theme === 'dark' ? "text-slate-400 hover:text-slate-200 hover:bg-white/5" : "text-slate-500 hover:text-slate-900 hover:bg-white/50")
                    )}
                  >
                    <div className={cn(
                      "p-2 rounded-xl transition-colors",
                      mode === 'dashboard' ? "bg-indigo-500 text-white" : (theme === 'dark' ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-500")
                    )}>
                      <LayoutDashboard className="w-4 h-4" />
                    </div>
                    Dashboard Geral
                  </button>

                  <button
                    onClick={() => setMode('view')}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-black transition-all",
                      mode === 'view' 
                        ? (theme === 'dark' ? "bg-white/10 text-white shadow-lg shadow-black/20 ring-1 ring-white/10" : "bg-white text-slate-900 shadow-md") 
                        : (theme === 'dark' ? "text-slate-400 hover:text-slate-200 hover:bg-white/5" : "text-slate-500 hover:text-slate-900 hover:bg-white/50")
                    )}
                  >
                    <div className={cn(
                      "p-2 rounded-xl transition-colors",
                      mode === 'view' ? "bg-emerald-500 text-white" : (theme === 'dark' ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-500")
                    )}>
                      <MousePointer2 className="w-4 h-4" />
                    </div>
                    Monitoramento
                  </button>
                  
                  <button
                    onClick={() => setMode('database')}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-black transition-all",
                      mode === 'database' 
                        ? (theme === 'dark' ? "bg-white/10 text-white shadow-lg shadow-black/20 ring-1 ring-white/10" : "bg-white text-slate-900 shadow-md") 
                        : (theme === 'dark' ? "text-slate-400 hover:text-slate-200 hover:bg-white/5" : "text-slate-500 hover:text-slate-900 hover:bg-white/50")
                    )}
                  >
                    <div className={cn(
                      "p-2 rounded-xl transition-colors",
                      mode === 'database' ? "bg-blue-500 text-white" : (theme === 'dark' ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-500")
                    )}>
                      <Database className="w-4 h-4" />
                    </div>
                    Base de Dados
                  </button>

                  <button
                    onClick={() => setMode('edit')}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-black transition-all",
                      mode === 'edit' 
                        ? (theme === 'dark' ? "bg-white/10 text-white shadow-lg shadow-black/20 ring-1 ring-white/10" : "bg-white text-slate-900 shadow-md") 
                        : (theme === 'dark' ? "text-slate-400 hover:text-slate-200 hover:bg-white/5" : "text-slate-500 hover:text-slate-900 hover:bg-white/50")
                    )}
                  >
                    <div className={cn(
                      "p-2 rounded-xl transition-colors",
                      mode === 'edit' ? "bg-amber-500 text-white" : (theme === 'dark' ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-500")
                    )}>
                      <Settings2 className="w-4 h-4" />
                    </div>
                    Editar Layout
                  </button>
                </div>
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

                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-500">Direção do Fluxo</label>
                      <select
                        value={selectedBay.orientation || 'vertical'}
                        onChange={(e) => updateBay(selectedBay.id, { orientation: e.target.value as 'vertical' | 'horizontal' })}
                        className={cn(
                          "w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/50",
                          theme === 'dark' ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                        )}
                      >
                        <option value="vertical">Vertical (Lista)</option>
                        <option value="horizontal">Horizontal (Lado a Lado)</option>
                      </select>
                    </div>

                    <div className="space-y-1.5 pt-1">
                      <label className="text-sm font-medium text-slate-500">Grupo de Picking (Aba)</label>
                      <select
                        value={selectedBay.tabGroup || 'geral'}
                        onChange={(e) => updateBay(selectedBay.id, { tabGroup: e.target.value as 'geral' | 'format' })}
                        className={cn(
                          "w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/50",
                          theme === 'dark' ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                        )}
                      >
                        <option value="geral">Picking Geral</option>
                        <option value="format">Picking Format. Carro</option>
                      </select>
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
        {/* Global Sidebar Toggle (Visible when sidebar is closed) */}
        <AnimatePresence>
          {!sidebarOpen && (
            <motion.div 
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              className="fixed top-6 left-6 z-[60]"
            >
              <button 
                onClick={() => setSidebarOpen(true)}
                className={cn(
                  "p-4 rounded-[1.5rem] transition-all hover:scale-110 active:scale-95 group relative border shadow-2xl backdrop-blur-3xl",
                  theme === 'dark' 
                    ? "bg-slate-900/90 text-white border-white/10 glow-indigo" 
                    : "bg-stone-100/95 border-stone-200 shadow-stone-200/50"
                )}
                title="Abrir Painel"
              >
                <ChevronRight className="w-6 h-6" />
                <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-slate-950 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {mode === 'dashboard' ? (
          <div className={cn(
            "flex-1 p-4 sm:p-8 overflow-y-auto custom-scrollbar transition-colors duration-300 relative",
            theme === 'dark' ? "bg-slate-950" : "bg-sky-50"
          )}>
            {/* Background Glows */}
            <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-indigo-500/5 blur-[120px] rounded-full -ml-64 -mt-64 pointer-events-none" />
            <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-emerald-500/5 blur-[120px] rounded-full -mr-64 -mb-64 pointer-events-none" />

            <div className="max-w-7xl mx-auto space-y-8 relative z-10">
              <div className="flex flex-col gap-1">
                <h1 className={cn(
                  "text-3xl font-black tracking-tight",
                  theme === 'dark' ? "text-white" : "text-slate-900"
                )}>
                  Dashboard Operacional
                </h1>
                <p className="text-slate-400 text-sm font-medium">Análise em tempo real da performance de picking.</p>
              </div>

              {/* KPI Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  { label: 'Total de Carros', value: filteredRecords.length, icon: <Car className="w-5 h-5" />, color: 'indigo' },
                  { label: 'Embarcados', value: filteredRecords.filter(r => r.status === 'EMBARCADO').length, icon: <CheckCircle2 className="w-5 h-5" />, color: 'blue' },
                  { label: 'Em Atraso', value: filteredRecords.filter(r => getSlaStatus(r).isLate).length, icon: <AlertCircle className="w-5 h-5" />, color: 'rose' },
                  { 
                    label: 'Ocupação Total', 
                    value: `${Math.round((bays.reduce((acc, b) => acc + (b.currentCars || 0), 0) / (bays.reduce((acc, b) => acc + b.capacity, 0) || 1)) * 100)}%`, 
                    icon: <TrendingUp className="w-5 h-5" />, 
                    color: 'emerald' 
                  },
                ].map((kpi, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className={cn(
                      "p-6 rounded-[2rem] border backdrop-blur-3xl transition-all duration-300",
                      theme === 'dark' ? "bg-slate-900/40 border-white/5 ring-1 ring-white/5" : "bg-white border-blue-100 shadow-xl shadow-blue-900/5"
                    )}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className={cn(
                        "p-3 rounded-2xl",
                        kpi.color === 'indigo' ? "bg-indigo-500/10 text-indigo-400" :
                        kpi.color === 'blue' ? "bg-blue-500/10 text-blue-400" :
                        kpi.color === 'rose' ? "bg-rose-500/10 text-rose-400" :
                        "bg-emerald-500/10 text-emerald-400"
                      )}>
                        {kpi.icon}
                      </div>
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">{kpi.label}</h3>
                      <p className={cn("text-3xl font-black tabular-nums", theme === 'dark' ? "text-white" : "text-slate-900")}>
                        {kpi.value}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Advanced Operational Health Chart */}
                <div className={cn(
                  "lg:col-span-3 p-8 rounded-[2.5rem] border backdrop-blur-3xl flex flex-col gap-8 transition-all duration-300",
                  theme === 'dark' ? "bg-slate-900/40 border-white/5 ring-1 ring-white/5" : "bg-stone-100 border-stone-300 shadow-xl"
                )}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl">
                        <TrendingUp className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className={cn("text-lg font-black tracking-tight", theme === 'dark' ? "text-white" : "text-slate-900")}>
                          Saúde Operacional
                        </h3>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Plano do Dia · Real · Retroativo · Atrasados</p>
                        <p className="text-[10px] font-medium text-slate-400 mt-1 max-w-sm">Este gráfico mostra as previsões de embarques. As barras azuis refletem a quantidade de veículos embarcados por hora e a linha verde o avanço da meta.</p>
                      </div>
                    </div>
                    {/* Legenda do Gráfico */}
                    <div className="flex items-center gap-6 px-4 py-2 bg-white/5 rounded-2xl border border-white/5">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-blue-500/40 rounded-sm border border-blue-500/50" />
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Embarques/Hora</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Progresso Acumulado</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pb-4">
                    {(() => {
                      const today = new Date();
                      const todayStr = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()}`;
                      const now = new Date();

                      // Plano do Dia: carros com DT_EMB == hoje
                      const planoDia = filteredRecords.filter(r => r.embarkDate === todayStr);

                      // Real: carros já embarcados (status EMBARCADO) com data de hoje
                      const real = filteredRecords.filter(r => r.status === 'EMBARCADO' && r.embarkDate === todayStr);

                      // Retroativo: carros NÃO embarcados de dias anteriores
                      const retroativo = filteredRecords.filter(r => {
                        if (r.status === 'EMBARCADO') return false;
                        if (r.embarkDate === todayStr) return false;
                        const t = parseExcelDate(r.embarkDate, r.embarkTime);
                        return t && t < now;
                      });

                      // Atrasados: carros de HOJE que já venceram a previsão de embarque
                      const atrasados = filteredRecords.filter(r => {
                        if (r.embarkDate !== todayStr) return false;
                        if (r.status === 'EMBARCADO') return false;
                        const t = parseExcelDate(r.embarkDate, r.embarkTime);
                        return t && t < now;
                      });

                      return [
                        { label: 'Plano do Dia', value: planoDia.length, color: 'text-slate-500', desc: 'Embarques previstos hoje' },
                        { label: 'Real', value: real.length, color: 'text-blue-500', desc: 'Já embarcados hoje' },
                        { label: 'Retroativo', value: retroativo.length, color: 'text-amber-500', desc: 'Pendentes de dias anteriores' },
                        { label: 'Atrasados', value: atrasados.length, color: 'text-rose-500', desc: 'Hoje — previsão vencida' },
                      ].map((stat, i) => (
                        <div key={i} className="space-y-1">
                          <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.15em]">{stat.label}</span>
                          <p className={cn("text-2xl font-black tabular-nums", stat.color)}>{stat.value}</p>
                          <span className="text-[8px] text-slate-400 font-medium">{stat.desc}</span>
                        </div>
                      ));
                    })()}
                  </div>

                  <div className="h-56 w-full relative group pt-8 flex flex-col">
                    {/* Background Grid Lines */}
                    <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-5 pb-6">
                      {[1, 2, 3, 4].map(i => <div key={i} className="w-full h-px bg-white" />)}
                    </div>

                    {/* Bars & Cumulative Line Overlay */}
                    {(() => {
                      const hourlyData = Array.from({ length: 24 }).map((_, h) => {
                        return filteredRecords.filter(r => r.status === 'EMBARCADO' && r.embarkTime?.startsWith(h.toString().padStart(2, '0'))).length;
                      });
                      const max = Math.max(...hourlyData) || 1;
                      let cumulative = 0;
                      const cumulativeData = hourlyData.map(d => {
                        cumulative += d;
                        return cumulative;
                      });
                      const totalMax = cumulativeData[cumulativeData.length - 1] || 1;

                      // Exact mathematical center for each of the 24 columns
                      const points = cumulativeData.map((d, i) => {
                        const x = ((i + 0.5) / 24) * 100;
                        const y = 100 - (d / totalMax) * 100;
                        return `${x},${y}`;
                      }).join(' ');

                      return (
                        <>
                          <div className="flex-1 relative w-full flex items-end px-2">
                            <svg className="absolute inset-x-2 inset-y-0 w-[calc(100%-16px)] h-full pointer-events-none z-10 overflow-visible drop-shadow-[0_0_6px_rgba(16,185,129,0.5)]" viewBox="0 0 100 100" preserveAspectRatio="none">
                              <motion.polyline
                                points={points}
                                fill="none"
                                stroke="#10b981" // emerald-500
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                initial={{ pathLength: 0 }}
                                animate={{ pathLength: 1 }}
                                transition={{ duration: 2, ease: "easeInOut" }}
                              />
                            </svg>

                            {hourlyData.map((count, h) => {
                              const hPerc = (count / max) * 100;
                              const cumPerc = (cumulativeData[h] / totalMax) * 100;
                              
                              return (
                                <div key={h} className="flex-1 flex flex-col items-center group/bar relative h-full px-[1px] sm:px-0.5">
                                  <div className="w-full relative flex-1 flex flex-col justify-end">
                                    {/* Hourly Count Label */}
                                    {count > 0 && (
                                      <motion.span
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className={cn(
                                          "absolute left-1/2 -translate-x-1/2 text-[10px] sm:text-[11px] font-black tabular-nums z-20",
                                          theme === 'dark' ? "text-blue-400" : "text-blue-600"
                                        )}
                                        style={{ bottom: `${hPerc * 0.7 + 2}%` }}
                                      >
                                        {count}
                                      </motion.span>
                                    )}

                                    {/* Hourly Bar */}
                                    <motion.div 
                                      initial={{ height: 0 }}
                                      animate={{ height: `${hPerc * 0.7}%` }}
                                      className={cn(
                                        "w-full rounded-t-sm transition-all duration-500",
                                        count > 0 ? "bg-blue-500/20 group-hover/bar:bg-blue-500/40" : "bg-white/5"
                                      )}
                                    />
                                    
                                    {/* Cumulative Point & Label */}
                                    <motion.div 
                                      initial={{ bottom: 0 }}
                                      animate={{ bottom: `${cumPerc}%` }}
                                      className="absolute left-1/2 -translate-x-1/2 w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.8)] z-20 border border-emerald-900 flex items-center justify-center"
                                    >
                                      {/* Cumulative Text Label floating above the point when data changes */}
                                      {count > 0 && cumulativeData[h] > 0 && (
                                        <span className="absolute bottom-2.5 text-[10px] font-black text-emerald-400 whitespace-nowrap z-30 drop-shadow-md">
                                          {cumulativeData[h]}
                                        </span>
                                      )}
                                    </motion.div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex w-full px-2 mt-2 h-4 items-center">
                            {hourlyData.map((_, h) => (
                              <div key={`label-${h}`} className="flex-1 flex justify-center">
                                <span className={cn("text-[8px] sm:text-[9px] font-bold tabular-nums", theme === 'dark' ? "text-slate-500" : "text-slate-400")}>{h}h</span>
                              </div>
                            ))}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* Late by Model & Sector */}
                <div className={cn(
                  "lg:col-span-2 p-8 rounded-[2.5rem] border backdrop-blur-3xl flex flex-col gap-6 transition-all duration-300",
                  theme === 'dark' ? "bg-slate-900/40 border-white/5 ring-1 ring-white/5" : "bg-white border-blue-100 shadow-xl shadow-blue-900/5"
                )}>
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-rose-500/10 text-rose-400 rounded-xl">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <h3 className={cn("text-lg font-black tracking-tight", theme === 'dark' ? "text-white" : "text-slate-900")}>
                      Atrasos Críticos
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between px-1">
                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Por Modelo</h4>
                        <div className="w-1 h-1 rounded-full bg-rose-500 animate-pulse" />
                      </div>
                      <div className="space-y-2">
                        {Array.from(new Set(filteredRecords.map(r => r.model))).filter(Boolean).map(model => {
                          const late = filteredRecords.filter(r => r.model === model && getSlaStatus(r).isLate).length;
                          if (late === 0) return null;
                          return (
                            <div key={model} className="flex items-center justify-between text-[11px] font-black p-3 rounded-2xl bg-white/5 border border-white/5 hover:border-rose-500/20 transition-colors group">
                              <span className="text-slate-400 group-hover:text-slate-200 transition-colors">{model}</span>
                              <span className="text-rose-500 tabular-nums bg-rose-500/10 px-2 py-0.5 rounded-lg">{late}</span>
                            </div>
                          );
                        }).filter(Boolean).sort((a, b) => (b?.props.children[1].props.children || 0) - (a?.props.children[1].props.children || 0)).slice(0, 5)}
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between px-1">
                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Por Setor</h4>
                        <div className="w-1 h-1 rounded-full bg-rose-500 animate-pulse" />
                      </div>
                      <div className="space-y-2">
                        {Array.from(new Set(filteredRecords.map(r => r.sectorName))).filter(Boolean).map(sector => {
                          const late = filteredRecords.filter(r => r.sectorName === sector && getSlaStatus(r).isLate).length;
                          if (late === 0) return null;
                          return (
                            <div key={sector} className="flex items-center justify-between text-[11px] font-black p-3 rounded-2xl bg-white/5 border border-white/5 hover:border-rose-500/20 transition-colors group">
                              <span className="text-slate-400 group-hover:text-slate-200 transition-colors">{sector}</span>
                              <span className="text-rose-500 tabular-nums bg-rose-500/10 px-2 py-0.5 rounded-lg">{late}</span>
                            </div>
                          );
                        }).filter(Boolean).sort((a, b) => (b?.props.children[1].props.children || 0) - (a?.props.children[1].props.children || 0)).slice(0, 5)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Location Classification Breakdown */}
                <div className={cn(
                  "p-8 rounded-[2.5rem] border backdrop-blur-3xl flex flex-col gap-6 transition-all duration-300",
                  theme === 'dark' ? "bg-slate-900/40 border-white/5 ring-1 ring-white/5" : "bg-white border-blue-100 shadow-xl shadow-blue-900/5"
                )}>
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl">
                      <Layout className="w-5 h-5" />
                    </div>
                    <h3 className={cn("text-lg font-black tracking-tight", theme === 'dark' ? "text-white" : "text-slate-900")}>
                      Categorização Picking
                    </h3>
                  </div>

                  <div className="space-y-4">
                    {(() => {
                      const categories = [
                        'Picking (Geral)',
                        'Expedição',
                        'Picking (Format. Carro)',
                        'Picking (DCC II)',
                        'Picking (Miúdo)',
                        'Picking (Sala de Faixa)',
                        'Controlador'
                      ];
                      
                      return categories.map(cat => {
                        const count = filteredRecords.filter(r => getLocationCategory(r.location) === cat).length;
                        if (count === 0 && cat === 'Controlador') return null;
                        
                        const percent = Math.round((count / (filteredRecords.length || 1)) * 100);
                        
                        return (
                          <div key={cat} className="space-y-1.5">
                            <div className="flex justify-between items-end px-1">
                              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{cat}</span>
                              <span className="text-[11px] font-black text-slate-400 tabular-nums">{count}</span>
                            </div>
                            <div className={cn("h-1.5 w-full rounded-full overflow-hidden", theme === 'dark' ? "bg-white/5" : "bg-stone-300")}>
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${percent}%` }}
                                className={cn(
                                  "h-full rounded-full transition-all duration-1000",
                                  cat.includes('Picking') ? "bg-blue-500" : "bg-emerald-500"
                                )}
                              />
                            </div>
                          </div>
                        );
                      }).filter(Boolean);
                    })()}
                  </div>
                </div>

                {/* Controller Activity - Line Chart Style */}
                <div className={cn(
                  "p-8 rounded-[2.5rem] border backdrop-blur-3xl flex flex-col gap-6 transition-all duration-300",
                  theme === 'dark' ? "bg-slate-900/40 border-white/5 ring-1 ring-white/5" : "bg-stone-100 border-stone-300 shadow-xl"
                )}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-rose-500/10 text-rose-400 rounded-xl">
                        <Users className="w-5 h-5" />
                      </div>
                      <h3 className={cn("text-lg font-black tracking-tight", theme === 'dark' ? "text-white" : "text-slate-900")}>
                        Atividade por Controlador
                      </h3>
                    </div>
                    <div className="flex gap-1">
                      <button 
                        disabled={controllerPageIndex === 0}
                        onClick={() => setControllerPageIndex(prev => Math.max(0, prev - 1))}
                        className="p-1.5 rounded-lg bg-white/5 text-slate-400 disabled:opacity-20 hover:bg-white/10"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setControllerPageIndex(prev => prev + 1)}
                        className="p-1.5 rounded-lg bg-white/5 text-slate-400 hover:bg-white/10"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="relative h-72 w-full mt-4">
                    {(() => {
                      const controllerStats = filteredRecords
                        .filter(r => getLocationCategory(r.location) === 'Controlador')
                        .reduce((acc, r) => {
                          const c = r.location || 'NÃO IDENTIFICADO';
                          acc[c] = (acc[c] || 0) + 1;
                          return acc;
                        }, {} as Record<string, number>);

                      const sortedControllers = (Object.entries(controllerStats) as [string, number][])
                        .sort((a, b) => b[1] - a[1]);

                      const displayControllers = sortedControllers.slice(controllerPageIndex * 8, (controllerPageIndex * 8) + 8);

                      if (displayControllers.length === 0 && controllerPageIndex > 0) {
                        setControllerPageIndex(0);
                        return null;
                      }

                      const max = Math.max(...(Object.values(controllerStats) as number[]), 1);

                      return (
                        <div className="flex flex-col gap-4 h-full overflow-y-auto custom-scrollbar pr-1 py-2">
                          {displayControllers.map(([ctrl, count]) => (
                            <div key={ctrl} className="flex flex-col gap-1.5 group">
                              <div className="flex justify-between items-end px-1">
                                <span className="text-[11px] font-black text-slate-400 group-hover:text-slate-200 uppercase truncate max-w-[150px] transition-colors">{ctrl}</span>
                                <span className="text-[12px] font-black text-rose-500 tabular-nums">{count}</span>
                              </div>
                              <div className={cn(
                                "h-2.5 w-full rounded-full relative bg-white/5 overflow-hidden ring-1 ring-white/5",
                                theme === 'light' && "bg-blue-50 ring-blue-100"
                              )}>
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: `${(count / max) * 100}%` }}
                                  className="h-full bg-gradient-to-r from-rose-500 to-rose-400 rounded-full shadow-[0_0_15px_rgba(244,63,94,0.3)] transition-all duration-1000"
                                />
                              </div>
                            </div>
                          ))}
                          {sortedControllers.length === 0 && (
                            <div className="flex-1 flex flex-col items-center justify-center opacity-40">
                              <Users className="w-6 h-6 mb-2" />
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Nenhum dado de controlador</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Stagnant Vehicles */}
                <div className={cn(
                  "p-8 rounded-[2.5rem] border backdrop-blur-3xl flex flex-col gap-6 transition-all duration-300",
                  theme === 'dark' ? "bg-slate-900/40 border-white/5 ring-1 ring-white/5" : "bg-stone-100 border-stone-300 shadow-xl"
                )}>
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-xl">
                      <Clock className="w-5 h-5" />
                    </div>
                    <h3 className={cn("text-lg font-black tracking-tight", theme === 'dark' ? "text-white" : "text-slate-900")}>
                      Carros não locados
                    </h3>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 -mr-1 space-y-3 max-h-[400px]">
                    {dbRecords
                      .filter(r => r.status !== 'EMBARCADO')
                      .map(r => {
                        const targetDate = parseExcelDate(r.embarkDate, r.embarkTime);
                        if (!targetDate) return { ...r, daysLate: 0 };
                        const diffMs = new Date().getTime() - targetDate.getTime();
                        const daysLate = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
                        return { ...r, daysLate };
                      })
                      .filter(r => r.daysLate > 0)
                      .sort((a, b) => b.daysLate - a.daysLate)
                      .slice(0, 20)
                      .map(r => (
                        <div key={r.carId} className="flex items-center gap-3 p-4 rounded-[1.5rem] bg-white/5 border border-white/5 group hover:border-amber-500/30 transition-all">
                          <div className="flex flex-col items-center justify-center w-12 h-12 bg-amber-500/10 rounded-2xl group-hover:bg-amber-500/20 transition-colors border border-amber-500/20">
                            <span className="text-[14px] font-black text-amber-500">+{r.daysLate}</span>
                            <span className="text-[7px] font-black text-amber-500/60 uppercase">Dias</span>
                          </div>
                          <div className="flex flex-col flex-1 overflow-hidden">
                            <span className={cn("text-xs font-black truncate transition-colors", theme === 'dark' ? "text-white" : "text-slate-900")}>{r.carId}</span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{r.location}</span>
                              <span className="text-[8px] text-slate-600 font-bold">•</span>
                              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{r.model}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    {dbRecords.filter(r => r.status !== 'EMBARCADO' && parseExcelDate(r.embarkDate, r.embarkTime) && new Date() > parseExcelDate(r.embarkDate, r.embarkTime)!).length === 0 && (
                      <div className="py-12 text-center opacity-40">
                        <CheckCircle2 className="w-8 h-8 mx-auto mb-3 text-emerald-500" />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em]">Nenhum veículo atrasado</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : mode === 'database' ? (
          <div className={cn(
            "flex-1 p-4 sm:p-8 overflow-y-auto custom-scrollbar transition-colors duration-300 relative",
            theme === 'dark' ? "bg-slate-950" : "bg-sky-50"
          )}>
            {/* Decorative background glows for Database View */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-500/5 blur-[120px] rounded-full -mr-64 -mt-64 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-emerald-500/5 blur-[120px] rounded-full -ml-64 -mb-64 pointer-events-none" />

            <div className="max-w-6xl mx-auto space-y-8 relative z-10">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="space-y-1">
                  <h1 className={cn(
                    "text-xl sm:text-3xl font-black tracking-tight transition-colors duration-300",
                    theme === 'dark' ? "text-white" : "text-slate-900"
                  )}>
                    Base de Dados
                  </h1>
                  <p className="text-slate-400 text-[10px] sm:text-sm">Exibindo {filteredRecords.length} de {dbRecords.length} veículos.</p>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  {(filterSector !== 'ALL' || filterModel !== 'ALL' || filterController !== 'ALL' || filterDate !== 'ALL' || filterTime !== 'ALL' || filterExcelStatus !== 'ALL' || filterCarId) && (
                    <button 
                      onClick={() => {
                        setFilterSector('ALL');
                        setFilterModel('ALL');
                        setFilterStatus('ALL');
                        setFilterExcelStatus('ALL');
                        setFilterController('ALL');
                        setFilterDate('ALL');
                        setFilterTime('ALL');
                        setFilterCarId('');
                      }}
                      className="px-4 py-3 bg-rose-500/10 text-rose-500 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-500/20 transition-all border border-rose-500/20"
                    >
                      Limpar Filtros
                    </button>
                  )}
                  <button 
                    onClick={() => setShowImport(true)}
                    className="flex-1 sm:flex-none px-6 py-3 bg-blue-600 text-white rounded-2xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 hover:bg-blue-500 transition-all shadow-xl shadow-blue-900/40 active:scale-95 group border border-blue-400/20"
                  >
                    <FileSpreadsheet className="w-4 h-4 group-hover:rotate-12 transition-transform" />
                    <span className="hidden xs:inline uppercase tracking-widest">Importar Excel</span>
                  </button>
                </div>
              </div>

              {/* Contextual Database Filters */}
              <div className={cn(
                "p-4 rounded-[2rem] border backdrop-blur-3xl flex flex-wrap gap-4 items-center transition-all duration-300",
                theme === 'dark' ? "bg-slate-900/40 border-white/5 ring-1 ring-white/5" : "bg-white border-blue-100 shadow-xl shadow-blue-900/5"
              )}>
                <div className="flex items-center gap-2 px-3 border-r border-slate-500/20">
                  <Filter className="w-4 h-4 text-slate-500" />
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Filtros</span>
                </div>
                <div className="flex-1 flex flex-wrap gap-3">
                  {[
                    { label: 'Controlador', value: filterController, setter: setFilterController, options: availableControllers },
                    { label: 'Setor', value: filterSector, setter: setFilterSector, options: availableSectors },
                    { label: 'Modelo', value: filterModel, setter: setFilterModel, options: availableModels },
                    { label: 'Data', value: filterDate, setter: setFilterDate, options: availableDates },
                  ].map(f => (
                    <div key={f.label} className="relative group">
                      <select 
                        value={f.value}
                        onChange={e => f.setter(e.target.value)}
                        className={cn(
                          "pl-3 pr-8 py-2 rounded-xl text-[10px] font-black bg-slate-500/5 border border-transparent focus:border-blue-500/50 focus:outline-none appearance-none cursor-pointer transition-all uppercase tracking-tighter",
                          theme === 'dark' ? "text-slate-300" : "text-slate-600",
                          f.value !== 'ALL' && "text-blue-500 bg-blue-500/5 border-blue-500/20"
                        )}
                      >
                        <option value="ALL">{f.label.toUpperCase()}: TODOS</option>
                        {f.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                      <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rotate-90 text-slate-500 pointer-events-none" />
                    </div>
                  ))}
                </div>
              </div>

              <div className={cn(
                "rounded-[2.5rem] border overflow-x-auto transition-all duration-300 custom-scrollbar-none sm:custom-scrollbar backdrop-blur-3xl",
                theme === 'dark' 
                  ? "bg-slate-900/40 border-white/5 shadow-2xl shadow-black/40 ring-1 ring-white/5" 
                  : "bg-white/60 border-slate-200 shadow-xl shadow-slate-200/50"
              )}>
                <table className="w-full text-left border-collapse min-w-[600px] sm:min-w-0">
                  <thead>
                    <tr className={cn(
                      "transition-colors duration-300",
                      theme === 'dark' ? "bg-white/5 border-b border-white/5" : "bg-stone-200 border-b border-stone-300"
                    )}>
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Veículo</th>
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Modelo</th>
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Locação</th>
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Setor</th>
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Status</th>
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 text-right">Embarque</th>
                    </tr>
                  </thead>
                  <tbody className={cn(
                    "divide-y transition-colors duration-300",
                    theme === 'dark' ? "divide-slate-800" : "divide-stone-300"
                  )}>
                    {filteredRecords.map(record => (
                      <tr key={record.carId} className={cn(
                        "transition-colors duration-300 group",
                        theme === 'dark' ? "hover:bg-white/5" : "hover:bg-stone-200/50"
                      )}>
                        <td className={cn(
                          "px-8 py-5 text-sm font-black transition-colors duration-300",
                          theme === 'dark' ? "text-white" : "text-slate-900"
                        )}>
                          {record.carId}
                        </td>
                        <td className="px-8 py-5 text-sm font-black text-slate-500/70">{record.model}</td>
                        <td className="px-8 py-5">
                          <span className={cn(
                            "px-3 py-1.5 rounded-xl text-[11px] font-black tabular-nums border transition-all duration-300",
                            theme === 'dark' 
                              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 group-hover:glow-emerald" 
                              : "bg-emerald-50 border-emerald-100 text-emerald-700"
                          )}>
                            {record.location}
                          </span>
                        </td>
                        <td className="px-8 py-5 text-[11px] font-black text-slate-500 uppercase tracking-wider">{record.sectorName}</td>
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              "w-1.5 h-1.5 rounded-full animate-pulse",
                              record.status === 'EMBARCADO' ? "bg-blue-500" : "bg-amber-500"
                            )} />
                            <span className={cn(
                              "text-[10px] font-black uppercase tracking-widest",
                              record.status === 'EMBARCADO' ? "text-blue-500" : "text-amber-500"
                            )}>
                              {record.status}
                            </span>
                          </div>
                        </td>
                        <td className="px-8 py-5 text-[11px] font-black text-slate-500/60 tabular-nums text-right">
                          {record.embarkDate} <span className="opacity-40 mx-0.5">•</span> {record.embarkTime}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Command Center & Filters */}
            <div className="p-4 lg:p-6 z-10 bg-slate-950/30 backdrop-blur-sm border-b border-white/5 shadow-md">
              {/* Command Center Overlay */}
              <div className={cn(
                  "flex items-center gap-4 px-4 py-2.5 border rounded-[2rem] shadow-xl transition-all duration-500 w-full",
                  theme === 'dark' 
                    ? "bg-slate-900/60 border-white/10 shadow-black/60 ring-1 ring-white/5" 
                    : "bg-white/80 backdrop-blur-md border-blue-100 shadow-xl shadow-blue-900/5"
                )}>
                  {/* Left Section: Sidebar & Basic Stats */}
                  <div className="flex items-center gap-3">
                    <div className="hidden md:flex items-center gap-3 pl-2">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span className={cn("text-[10px] font-black tracking-[0.2em] transition-colors", theme === 'dark' ? "text-white" : "text-slate-900")}>LIVE</span>
                        </div>
                        <span className="text-[14px] font-black tabular-nums transition-colors">{dbRecords.length} <span className="text-[8px] font-bold text-slate-500 tracking-widest">TPS</span></span>
                      </div>
                    </div>
                  </div>

                  <div className="w-px h-8 bg-slate-500/20 mx-1 hidden md:block" />

                  {/* Center Section: Global Search Command */}
                  <div className="flex-1 max-w-2xl relative group">
                    <div className={cn(
                      "flex items-center gap-3 px-6 py-2.5 rounded-xl transition-all duration-300 border",
                      theme === 'dark' 
                        ? "bg-black/20 border-white/10 hover:border-indigo-500/50 focus-within:border-indigo-500" 
                        : "bg-blue-50/50 border-blue-100 hover:border-blue-200 focus-within:border-blue-500 focus-within:bg-white"
                    )}>
                      <Search className={cn("w-4 h-4 transition-colors", filterCarId ? "text-emerald-500" : "text-slate-500")} />
                      <input 
                        ref={searchInputRef}
                        type="text"
                        placeholder="Comando de Busca (ID do Veículo)"
                        value={filterCarId}
                        onChange={e => setFilterCarId(e.target.value)}
                        className={cn(
                          "w-full text-sm font-bold bg-transparent focus:outline-none placeholder:text-slate-500/50",
                          theme === 'dark' ? "text-white" : "text-slate-900"
                        )}
                      />
                      <div className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-500/30 bg-slate-500/10">
                        <span className="text-[10px] font-black text-slate-500">⌘</span>
                        <span className="text-[10px] font-black text-slate-500">K</span>
                      </div>
                    </div>
                  </div>

                  {/* Right Section: Toggles & Actions */}
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setShowMobileFilters(!showMobileFilters)}
                      className={cn(
                        "p-3 rounded-xl transition-all hover:scale-105 active:scale-95 flex items-center gap-2 group relative overflow-hidden",
                        showMobileFilters 
                          ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/30" 
                          : (theme === 'dark' ? "bg-slate-800 text-slate-400" : "bg-stone-200 text-slate-600 border border-stone-300 shadow-sm hover:bg-stone-300")
                      )}
                    >
                      <Settings2 className="w-4 h-4 group-hover:rotate-12 transition-transform" />
                      <span className="text-[10px] font-black tracking-widest hidden lg:block">FILTROS</span>
                      { (filterSector !== 'ALL' || filterModel !== 'ALL' || filterStatus !== 'ALL' || filterExcelStatus !== 'ALL' || filterController !== 'ALL' || filterDate !== 'ALL' || filterTime !== 'ALL') && (
                        <div className="absolute top-1 right-1 min-w-[1.25rem] h-5 px-1 bg-rose-500 rounded-full border-2 border-slate-950 flex items-center justify-center animate-bounce-subtle">
                          <span className="text-[8px] font-black text-white">{filteredRecords.length}</span>
                        </div>
                      )}
                    </button>

                    <div className="w-px h-8 bg-slate-500/20 mx-1 hidden sm:block" />

                    <div className="flex gap-2">
                      <button 
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        className={cn(
                          "p-3 rounded-2xl transition-all hover:scale-105 active:scale-95 relative",
                          autoRefresh 
                            ? "bg-slate-800 text-emerald-400 border border-emerald-500/30" 
                            : "bg-slate-800/40 text-slate-500 border border-white/5"
                        )}
                      >
                        <RefreshCw className={cn("w-4 h-4", autoRefresh && "animate-spin-slow")} />
                        {autoRefresh && (
                          <div className="absolute -top-1 -right-1 flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                          </div>
                        )}
                      </button>
                      
                      <button 
                        onClick={() => fetchData()}
                        className={cn(
                          "hidden sm:flex p-3 rounded-xl transition-all hover:scale-105 active:scale-95 border",
                          theme === 'dark' ? "bg-slate-800 border-white/10 text-white" : "bg-stone-200 border-stone-300 text-slate-900 shadow-sm hover:bg-stone-300"
                        )}
                      >
                        <Database className="w-4 h-4 mr-2" />
                        <span className="text-[10px] font-black tracking-widest">SYNC</span>
                      </button>
                    </div>
                  </div>
              </div>

              {/* Advanced Filter Hub - Collapsible */}
              <AnimatePresence>
                {showMobileFilters && (
                  <motion.div
                    initial={{ opacity: 0, y: -20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -20, scale: 0.95 }}
                    className="mt-3"
                  >
                    <div className={cn(
                      "p-6 backdrop-blur-3xl border rounded-[2.5rem] shadow-2xl flex flex-wrap items-end gap-6",
                      theme === 'dark' 
                        ? "bg-slate-900/80 border-slate-700/50" 
                        : "bg-white/95 border-blue-100 shadow-xl shadow-blue-900/5"
                    )}>
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        {/* Custom Select Wrapper Component Logic */}
                        {[
                          { label: 'Setor', value: filterSector, setter: setFilterSector, options: availableSectors, all: 'ALL' },
                          { label: 'Modelo', value: filterModel, setter: setFilterModel, options: availableModels, all: 'ALL' },
                          { label: 'Controlador', value: filterController, setter: setFilterController, options: availableControllers, all: 'ALL' },
                          { label: 'Data Emb.', value: filterDate, setter: setFilterDate, options: availableDates, all: 'ALL' },
                          { label: 'Hora Emb.', value: filterTime, setter: setFilterTime, options: availableTimes, all: 'ALL' },
                          { label: 'Situação', value: filterExcelStatus, setter: setFilterExcelStatus, options: availableExcelStatuses, all: 'ALL' }
                        ].map((filter) => (
                          <div key={filter.label} className="flex flex-col gap-2">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">{filter.label}</span>
                            <div className="relative group">
                              <select 
                                value={filter.value} 
                                onChange={e => filter.setter(e.target.value)}
                                className={cn(
                                  "w-full px-4 py-2.5 rounded-xl text-xs font-black bg-slate-500/10 border border-transparent focus:border-emerald-500/50 focus:outline-none appearance-none cursor-pointer transition-all",
                                  theme === 'dark' ? "text-white" : "text-slate-900"
                                )}
                              >
                                <option value={filter.all}>TODOS</option>
                                {filter.options.map(opt => {
                                  let label = opt;
                                  if (filter.label === 'Setor') {
                                    const total = dbRecords.filter(r => r.sectorName === opt).length;
                                    const embarked = dbRecords.filter(r => r.sectorName === opt && r.status === 'EMBARCADO').length;
                                    const percent = Math.round((embarked / (total || 1)) * 100);
                                    label = `${opt} (${percent}%)`;
                                  }
                                  return <option key={opt} value={opt}>{label}</option>;
                                })}
                              </select>
                              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                                <ChevronRight className="w-3 h-3 rotate-90" />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Filter Stats Indicator */}
                      <div className="flex flex-col items-center justify-center px-6 py-4 bg-emerald-500/10 rounded-[2rem] border border-emerald-500/20 min-w-[140px] shadow-inner">
                        <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-1">Encontrados</span>
                        <div className="flex items-baseline gap-1">
                          <span className="text-3xl font-black text-emerald-400 tabular-nums">
                            {filteredRecords.length}
                          </span>
                          <span className="text-[10px] font-bold text-emerald-500/60 lowercase">veículos</span>
                        </div>
                      </div>

                      {/* Clear Actions */}
                      <button
                        onClick={() => {
                          setFilterSector('ALL');
                          setFilterModel('ALL');
                          setFilterStatus('ALL');
                          setFilterExcelStatus('ALL');
                          setFilterController('ALL');
                          setFilterDate('ALL');
                          setFilterTime('ALL');
                          setFilterCarId('');
                        }}
                        className="p-4 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl transition-all shadow-lg shadow-rose-500/20 active:scale-95 flex items-center gap-2 group"
                      >
                        <X className="w-4 h-4 group-hover:rotate-90 transition-transform" />
                        <span className="text-[10px] font-black tracking-widest">RESET</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            
            {/* Map Area */}
            <div className="flex-1 relative w-full h-full overflow-hidden flex flex-col">
              {/* Map Header & Tabs */}
              <div className="flex-none p-4 pb-0 z-20">
                <div className="flex flex-col gap-4">
                  <div>
                    <h2 className={cn("text-xl font-black tracking-tight drop-shadow-md", theme === 'dark' ? "text-white" : "text-slate-900")}>
                      Locações Principais
                    </h2>
                    <p className={cn("text-xs font-medium drop-shadow-md", theme === 'dark' ? "text-slate-400" : "text-slate-500")}>
                      Mapeamento de baias de picking.
                    </p>
                  </div>
                  
                  {/* Tabs */}
                  <div className="flex items-center gap-2 p-1 rounded-xl bg-slate-900/10 border border-slate-900/10 dark:bg-white/5 dark:border-white/5 w-fit backdrop-blur-md">
                    <button
                      onClick={() => setActiveTabGroup('geral')}
                      className={cn(
                        "px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all",
                        activeTabGroup === 'geral' 
                          ? (theme === 'dark' ? "bg-white text-slate-900 shadow-md" : "bg-white text-slate-900 shadow-md") 
                          : (theme === 'dark' ? "text-slate-400 hover:text-white hover:bg-white/5" : "text-slate-500 hover:text-slate-900 hover:bg-slate-900/5")
                      )}
                    >
                      Picking Geral
                    </button>
                    <button
                      onClick={() => setActiveTabGroup('format')}
                      className={cn(
                        "px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all",
                        activeTabGroup === 'format' 
                          ? (theme === 'dark' ? "bg-white text-slate-900 shadow-md" : "bg-white text-slate-900 shadow-md") 
                          : (theme === 'dark' ? "text-slate-400 hover:text-white hover:bg-white/5" : "text-slate-500 hover:text-slate-900 hover:bg-slate-900/5")
                      )}
                    >
                      Picking Formt. Carro
                    </button>
                    <div className="w-px h-6 bg-slate-300 dark:bg-slate-700 mx-1" />
                    <button
                      onClick={() => setIsPresentationMode(!isPresentationMode)}
                      className={cn(
                        "px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-1.5 h-[32px]",
                        isPresentationMode 
                          ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/20" 
                          : (theme === 'dark' ? "text-slate-400 hover:text-white hover:bg-white/5" : "text-slate-500 hover:text-slate-900 hover:bg-slate-900/5")
                      )}
                      title="Modo Apresentação (Auto-scroll)"
                    >
                      {isPresentationMode ? <MonitorPause className="w-4 h-4" /> : <MonitorPlay className="w-4 h-4" />}
                      <span className="hidden sm:inline">Apresentação</span>
                    </button>

                    {/* Speed Control Slider */}
                    <AnimatePresence>
                      {isPresentationMode && (
                        <motion.div 
                          initial={{ opacity: 0, width: 0, marginLeft: 0 }}
                          animate={{ opacity: 1, width: 'auto', marginLeft: 8 }}
                          exit={{ opacity: 0, width: 0, marginLeft: 0 }}
                          className="flex items-center gap-2 border-l border-slate-300 dark:border-slate-700 pl-3 overflow-hidden h-full"
                        >
                          <span className={cn("text-[10px] font-bold uppercase tracking-widest whitespace-nowrap", theme === 'dark' ? "text-slate-400" : "text-slate-500")}>
                            Velocidade
                          </span>
                          <input
                            type="range"
                            min="0.01"
                            max="0.25"
                            step="0.01"
                            value={presentationSpeed}
                            onChange={(e) => setPresentationSpeed(parseFloat(e.target.value))}
                            className="w-24 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                            title="Ajustar velocidade do autoscroll"
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>

              {/* Scrollable Map Container — will-change enables GPU-composited scroll */}
              <div 
                className="flex-1 overflow-auto custom-scrollbar relative w-full h-full mt-2"
                style={{ willChange: isPresentationMode ? 'scroll-position' : 'auto' }}
                ref={scrollContainerRef}
              >
                <div className="min-w-[10000px] min-h-[1200px] w-full h-full relative"
                     style={{ transform: 'translateZ(0)' }}
                     ref={containerRef}
                     onMouseDown={handleMouseDown}
                     onMouseMove={handleMouseMove}
                     onMouseUp={handleMouseUp}
                     onMouseLeave={handleMouseUp}>
                  
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

                  {bays.filter(bay => (bay.tabGroup || 'geral') === activeTabGroup).map(bay => {
                    const isSelected = selectedBayId === bay.id;
                    // PERFORMANCE: use pre-sorted map (computed once per dbRecords change)
                    const carsInBay = sortedCarsByLocation[bay.name] || [];

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
                        {/* Bay Card Background */}
                        <rect
                          x={`${displayBay.x}%`}
                          y={`${displayBay.y}%`}
                          width={`${displayBay.width}%`}
                          height={`${displayBay.height}%`}
                          rx="6"
                          className={cn(
                            "transition-all duration-200",
                            theme === 'dark'
                              ? (isSelected ? "fill-slate-900/90 stroke-emerald-500 shadow-lg" : "fill-slate-900/60 stroke-slate-800")
                              : (isSelected ? "fill-white stroke-blue-500" : "fill-white/40 stroke-blue-100")
                          )}
                          style={{ strokeWidth: isSelected ? 1.5 : 1 }}
                        />
                        <foreignObject
                          x={`${displayBay.x}%`}
                          y={`${displayBay.y}%`}
                          width={`${displayBay.width}%`}
                          height={`${displayBay.height}%`}
                        >
                          <div className="w-full h-full flex flex-col items-center justify-start p-1 overflow-hidden">
                            {/* Bay Header */}
                            <div className={cn(
                              "flex flex-col items-center justify-center py-1 w-full border-b mb-0.5",
                              theme === 'dark' ? "border-white/5" : "border-stone-300/60"
                            )}>
                              <div className={cn(
                                "text-[11px] font-black uppercase tracking-tight truncate w-full text-center",
                                isSelected 
                                  ? "text-emerald-400" 
                                  : (theme === 'dark' ? "text-slate-300" : "text-slate-700")
                              )}>
                                {displayBay.name}
                              </div>
                              <div className={cn(
                                "flex items-center gap-1 mt-0.5"
                              )}>
                                <span className={cn(
                                  "text-[8px] font-bold uppercase tracking-widest leading-none",
                                  theme === 'dark' ? "text-slate-500" : "text-slate-400"
                                )}>
                                  {carsInBay.length}/{displayBay.capacity}
                                </span>
                                <div className={cn(
                                  "w-1 h-1 rounded-full",
                                  color === 'rose' ? "bg-rose-500" : color === 'amber' ? "bg-amber-500" : "bg-emerald-500"
                                )} />
                              </div>
                            </div>

                            {/* Ruler / Capacity Indicator (Vertical Slots) */}
                            <div className={cn(
                              "flex-1 w-full flex mt-0.5 rounded-sm custom-scrollbar mb-1 relative transition-colors duration-300",
                              displayBay.orientation === 'horizontal' ? "flex-row overflow-x-auto overflow-y-hidden" : "flex-col overflow-y-auto overflow-x-hidden",
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
                                // PERFORMANCE: use pre-calculated SLA map instead of calling getSlaStatus per slot
                                let slaInfo = car ? (slaByCarId[car.carId] ?? getSlaStatus(car)) : null;
                                
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
                                    style={displayBay.orientation === 'horizontal' ? {
                                      width: displayBay.slotHeight ? `${displayBay.slotHeight * 3}px` : `84px`, // roughly aspect ratio
                                      minWidth: displayBay.slotHeight ? `${displayBay.slotHeight * 3}px` : `84px`
                                    } : { 
                                      height: displayBay.slotHeight ? `${displayBay.slotHeight}px` : `28px`,
                                      minHeight: displayBay.slotHeight ? `${displayBay.slotHeight}px` : `28px` 
                                    }}
                                    className={cn(
                                      "flex items-center shrink-0",
                                      displayBay.orientation === 'horizontal' ? "h-full flex-col px-1.5 py-1.5 gap-1.5 mr-[3px] justify-center" : "w-full flex-row px-1.5 gap-1.5 mb-[3px]",
                                      isOverflow && "bg-rose-950/40 border border-rose-500/40 border-dashed rounded-sm",
                                      !isVisible && "opacity-20 saturate-0" 
                                    )}
                                  >
                                    <span className={cn(
                                      "text-[8px] font-bold shrink-0 drop-shadow-md",
                                      displayBay.orientation === 'horizontal' ? "w-full text-center" : "w-4 text-right",
                                      isOverflow ? "text-rose-400" : "text-slate-500"
                                    )}>
                                      {i + 1}
                                    </span>
                                    <div className={cn(
                                      "rounded-[3px] overflow-hidden flex items-center justify-center border-l-2",
                                      displayBay.orientation === 'horizontal' ? "w-full flex-1" : "flex-1 h-full",
                                      car 
                                        ? (theme === 'dark'
                                            ? (isWrongSector 
                                                ? "bg-slate-900/80 border-l-fuchsia-500 border border-fuchsia-500/20 shadow-[0_0_10px_rgba(217,70,239,0.1)]" 
                                                : color === 'rose' 
                                                  ? "bg-slate-900/80 border-l-rose-500 border border-rose-500/20 shadow-[0_0_10px_rgba(244,63,94,0.1)]" 
                                                  : color === 'amber' 
                                                    ? "bg-slate-900/80 border-l-amber-500 border border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.1)]" 
                                                    : "bg-slate-900/80 border-l-emerald-500 border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]")
                                            : (isWrongSector 
                                                ? "bg-amber-50 border-l-amber-400 border border-amber-200" 
                                                : color === 'rose'
                                                  ? "bg-rose-50 border-l-rose-500 border border-rose-200"
                                                  : color === 'amber'
                                                    ? "bg-amber-50 border-l-amber-500 border border-amber-200"
                                                    : "bg-white border-l-blue-500 border border-blue-100")
                                          )
                                        : "bg-transparent border-l-transparent border-transparent",
                                      car && "hover:brightness-110 hover:z-10 cursor-help transition-all duration-150"
                                    )}
                                    onMouseEnter={(e) => {
                                      if (car) {
                                        setHoveredCar({ car, x: e.clientX, y: e.clientY });
                                      }
                                    }}
                                    onMouseMove={(e) => {
                                      // PERFORMANCE: only update position if it's the same car (avoid re-renders on every pixel)
                                      if (car) {
                                        setHoveredCar(prev =>
                                          prev?.car.carId === car.carId
                                            ? { car, x: e.clientX, y: e.clientY }
                                            : { car, x: e.clientX, y: e.clientY }
                                        );
                                      }
                                    }}
                                    onMouseLeave={() => setHoveredCar(null)}
                                    >
                                      {car && (
                                        <div className={cn("w-full h-full flex px-1.5 gap-1", displayBay.orientation === 'horizontal' ? "flex-col items-center justify-center py-1" : "flex-row items-center justify-between")}>
                                          <div className={cn("flex items-center min-w-0 flex-1 gap-1.5", displayBay.orientation === 'horizontal' && "justify-center mb-0.5 w-full")}>
                                            {isWrongSector ? (
                                              <AlertTriangle className={cn("shrink-0 animate-pulse", displayBay.orientation === 'horizontal' ? "w-4 h-4" : "w-3 h-3", theme === 'dark' ? "text-white" : "text-amber-500")} />
                                            ) : slaInfo?.isLate ? (
                                              <Clock className={cn("shrink-0", displayBay.orientation === 'horizontal' ? "w-4 h-4" : "w-3 h-3", theme === 'dark' ? "text-white/80" : "text-rose-400")} />
                                            ) : (
                                              <div className={cn("rounded-full shrink-0", displayBay.orientation === 'horizontal' ? "w-2.5 h-2.5" : "w-1.5 h-1.5", theme === 'dark' ? "bg-white/40" : "bg-emerald-400/60")} />
                                            )}
                                            {(!displayBay.orientation || displayBay.orientation === 'vertical') && (
                                              <span className={cn("font-bold leading-none truncate text-[11px]", theme === 'dark' ? "text-white drop-shadow-sm" : "text-slate-900")}>
                                                {car.carId}
                                              </span>
                                            )}
                                          </div>
                                          
                                          {/* SLA & Time Indicator */}
                                          {(!displayBay.slotHeight || displayBay.slotHeight >= 20 || displayBay.orientation === 'horizontal') && (
                                            <div className={cn("flex shrink-0 overflow-hidden", displayBay.orientation === 'horizontal' ? "w-full flex-col items-center gap-0.5 mt-auto" : "items-center justify-end ml-auto gap-1.5")}>
                                              <span className={cn("text-[8px] font-medium tracking-tight truncate", theme === 'dark' ? "text-white/90 drop-shadow-sm" : "text-slate-500")}>
                                                {displayBay.orientation === 'horizontal' ? car.carId : car.embarkTime}
                                              </span>
                                              {(() => {
                                                // PERFORMANCE: use pre-calculated slaInfo, never call getSlaStatus again here
                                                const sla = slaInfo || slaByCarId[car.carId] || getSlaStatus(car);
                                                return (
                                                  <div className={cn("rounded-sm text-[7px] font-bold uppercase whitespace-nowrap border text-center",
                                                    displayBay.orientation === 'horizontal' ? "w-full px-1 py-[1px] leading-tight text-[6px]" : "px-1.5 py-[2px]",
                                                    theme === 'dark' 
                                                      ? (sla.text === 'ATRASADO' ? "bg-rose-500/20 text-rose-300 border-rose-500/30" : sla.text === 'PRÓX. EMB.' ? "bg-amber-500/20 text-amber-300 border-amber-500/30" : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30")
                                                      : (sla.text === 'ATRASADO' ? "bg-rose-50 text-rose-600 border-rose-100" : sla.text === 'PRÓX. EMB.' ? "bg-amber-50 text-amber-600 border-amber-100" : "bg-emerald-50 text-emerald-600 border-emerald-100")
                                                  )}>
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
          </div>
        </div>
      )}
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
                  "relative w-full max-w-2xl border rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] overflow-hidden transition-colors duration-300 backdrop-blur-3xl",
                  theme === 'dark' 
                    ? "bg-slate-900/60 border-white/10 ring-1 ring-inset ring-white/5" 
                    : "bg-white/80 border-white shadow-slate-300/40 ring-1 ring-inset ring-black/5"
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
                <div className="p-8 space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 pl-1">Conteúdo do Excel (ID | Modelo | Locação | Setor | Status | Embarque)</label>
                    <textarea 
                      value={importText}
                      onChange={e => setImportText(e.target.value)}
                      placeholder="Cole aqui as linhas copiadas do Excel..."
                      className={cn(
                        "w-full h-64 p-6 rounded-[2rem] text-sm font-medium focus:outline-none transition-all duration-300 border resize-none custom-scrollbar",
                        theme === 'dark' 
                          ? "bg-black/40 border-white/5 text-white placeholder:text-slate-600 focus:border-blue-500/50 focus:bg-black/60 shadow-inner" 
                          : "bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-blue-500/50 focus:bg-white"
                      )}
                    />
                  </div>
                  <div className="flex gap-4 pt-2">
                    <button 
                      onClick={() => setShowImport(false)}
                      className={cn(
                        "flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95",
                        theme === 'dark' ? "bg-white/5 text-slate-400 hover:bg-white/10" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                      )}
                    >
                      Cancelar
                    </button>
                    <button 
                      onClick={handleImport}
                      className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-500 transition-all shadow-xl shadow-blue-900/40 active:scale-95 border border-blue-400/20"
                    >
                      Processar Importação
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
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className={cn(
                  "relative w-full max-w-sm p-8 border rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] text-center space-y-6 backdrop-blur-3xl",
                  theme === 'dark' 
                    ? "bg-slate-900/60 border-white/10 ring-1 ring-inset ring-white/5" 
                    : "bg-white/80 border-white shadow-slate-300/40 ring-1 ring-inset ring-black/5"
                )}
              >
                <div className="w-20 h-20 bg-rose-500/10 rounded-[2rem] flex items-center justify-center mx-auto border border-rose-500/20 glow-rose">
                  <Trash2 className="w-10 h-10 text-rose-500" />
                </div>
                <div className="space-y-2">
                  <h2 className={cn(
                    "text-2xl font-black tracking-tight transition-colors duration-300",
                    theme === 'dark' ? "text-white" : "text-slate-900"
                  )}>
                    Limpar Mapa?
                  </h2>
                  <p className="text-slate-400 text-sm font-medium leading-relaxed">
                    Esta ação irá excluir permanentemente todas as baias. Os dados da planilha não serão afetados.
                  </p>
                </div>
                <div className="flex flex-col gap-3 pt-4">
                  <button 
                    onClick={() => {
                      saveBays([]);
                      setSelectedBayId(null);
                      setShowClearConfirm(false);
                    }}
                    className="w-full py-4 bg-rose-600 text-white rounded-2xl font-black text-xs hover:bg-rose-500 transition-all shadow-xl shadow-rose-900/40 uppercase tracking-widest active:scale-95 border border-rose-400/20"
                  >
                    Sim, Limpar Tudo
                  </button>
                  <button 
                    onClick={() => setShowClearConfirm(false)}
                    className={cn(
                      "w-full py-4 rounded-2xl font-black text-xs transition-all uppercase tracking-widest active:scale-95",
                      theme === 'dark' ? "bg-white/5 text-slate-400 hover:bg-white/10" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
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