import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { 
  Search, 
  ClipboardList, 
  AlertTriangle, 
  ShoppingCart, 
  CheckCircle2, 
  XCircle, 
  ChevronRight,
  Download,
  Filter,
  Package,
  Menu,
  X,
  Map as MapIcon,
  List,
  Info,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Trash2,
  Lock,
  Unlock,
  Camera,
  Lightbulb,
  Maximize2,
  Copy,
  Plus,
  Save,
  Upload,
  FilePlus,
  Settings,
  Wrench,
  Eye,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Sun,
  Contrast,
  Droplets,
  Palette,
  RotateCcw,
  Image as ImageIcon,
  Check,
  Folder,
  EyeOff,
  Minus,
  Layers,
  MousePointer2,
  Target,
  Navigation,
  Eraser,
  Hash,
  Type,
  Square,
  Aperture,
  Tag
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { storage } from './lib/storage';
import { PARTS_DATA, Part } from './partsData';
import { MACHINE_DATABASE } from './machineData';
import { CATALOG_STRUCTURE, GroupInfo, SheetInfo } from './catalogStructure';

type ListType = 'order' | 'damaged';
type ViewMode = 'visual' | 'list' | 'bom';
type Criticality = 'A' | 'B' | 'C' | null;
type AnnotationType = 'circle' | 'arrow' | 'box' | 'text' | 'callout' | 'crop-circle' | 'eraser' | 'leader' | 'photo' | 'none';

interface HighlightState {
  isOpen: boolean;
  activeAnnId: string | null;
}

interface Annotation {
  id: string;
  type: AnnotationType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation?: number;
  color?: string;
  dash?: boolean;
  text?: string;
  fontSize?: number;
  isMagnifier?: boolean;
  strokeWidth?: number;
  photoUrl?: string;
}

interface SelectedItem {
  part: Part;
  type: ListType;
  timestamp: number;
  photo?: string;
  diagramCrop?: string;
  criticality?: Criticality;
  quantity: number;
  annotations?: Annotation[];
}

interface InspectionInfo {
  model: string;
  sn: string;
  tag: string;
  delivery: string;
  customer: string;
  description: string;
  machineDown: boolean;
  inspectorName: string;
  hourMeter: string;
  date: string;
  conclusion: string;
}

interface ImgConfig {
  scale: number;
  x: number;
  y: number;
  rotation?: number;
  isLocked?: boolean;
}

// Internal component for optimized sliders
const PropertySlider = ({ label, value, min, max, onChange, onInteractionStart, onInteractionEnd, unit = "" }: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (val: number) => void;
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
  unit?: string;
}) => {
  const [localValue, setLocalValue] = useState(value);

  // Sync local value when external value changes (e.g. selecting another annotation)
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    setLocalValue(val);
    // Allow real-time updates while interacting
    onChange(val);
  };

  // commit on mouse up / touch end anyway to ensure persistence flow
  const handleCommit = () => {
    onInteractionEnd?.();
    if (localValue !== value) {
      onChange(localValue);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center text-[8px] font-black text-zinc-500 uppercase tracking-widest">
        <span>{label}</span>
        <span>{localValue}{unit}</span>
      </div>
      <input 
        type="range" 
        min={min} 
        max={max} 
        className="w-full accent-landcros cursor-pointer"
        value={localValue}
        onPointerDown={onInteractionStart}
        onChange={handleChange}
        onPointerUp={handleCommit}
      />
    </div>
  );
};

// Internal component for optimized text inputs
const PropertyInput = ({ label, value, onChange }: {
  label: string;
  value: string;
  onChange: (val: string) => void;
}) => {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleBlur = () => {
    if (localValue !== value) {
      onChange(localValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur();
    }
  };

  return (
    <div className="space-y-2">
      <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest">{label}</span>
      <input 
        type="text"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-[10px] text-white font-black uppercase tracking-widest focus:border-landcros outline-none"
      />
    </div>
  );
};

export default function App() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>(CATALOG_STRUCTURE[0].name);
  const [selectedCategory, setSelectedCategory] = useState<string>(CATALOG_STRUCTURE[0].sheets[0].name);
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [inspectionInfo, setInspectionInfo] = useState<InspectionInfo>(() => {
    const saved = localStorage.getItem('inspectionInfo');
    return saved ? JSON.parse(saved) : {
      model: 'EX1200-6',
      sn: 'FF018JQ001014',
      tag: 'EH-4012',
      delivery: '2008',
      customer: 'U/M',
      description: 'Technical Inspection',
      machineDown: false,
      inspectorName: 'WARLEN SILVA',
      hourMeter: '76268,1',
      date: new Date().toISOString().split('T')[0],
      conclusion: ''
    };
  });

  const compressImage = useCallback((dataUrl: string, maxWidth = 1024, quality = 0.6): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = (maxWidth / width) * height;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = dataUrl;
    });
  }, []);

  const [viewMode, setViewMode] = useState<ViewMode>('visual');
  const [focusedPart, setFocusedPart] = useState<Part | null>(null);
  // Persistent State with IndexedDB for large data (images) and LocalStorage for small data
  const [diagramImages, setDiagramImages] = useState<Record<string, string | null>>({});
  const [isStorageReady, setIsStorageReady] = useState(false);

  const [imgConfigs, setImgConfigs] = useState<Record<string, ImgConfig>>(() => {
    const saved = localStorage.getItem('imgConfigs');
    return saved ? JSON.parse(saved) : {};
  });

  const [savedConfigs, setSavedConfigs] = useState<Record<string, ImgConfig>>(() => {
    const saved = localStorage.getItem('savedConfigs');
    return saved ? JSON.parse(saved) : {};
  });

  const [imgFilters, setImgFilters] = useState<Record<string, { brightness: number, contrast: number, grayscale: number }>>(() => {
    const saved = localStorage.getItem('imgFilters');
    return saved ? JSON.parse(saved) : {};
  });

  const [dragKey, setDragKey] = useState(0);
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [isPanelMinimized, setIsPanelMinimized] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isBlueprintMode, setIsBlueprintMode] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const [isDetailsVisible, setIsDetailsVisible] = useState(true);
  const [isFiltersVisible, setIsFiltersVisible] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [showBomModal, setShowBomModal] = useState(false);
  const [bomInput, setBomInput] = useState('');
  const [highlightState, setHighlightState] = useState<HighlightState>({ isOpen: false, activeAnnId: null });
  const [customCategories, setCustomCategories] = useState<Record<string, string[]>>(() => {
    const saved = localStorage.getItem('customCategories');
    try {
      const parsed = saved ? JSON.parse(saved) : {};
      // Handle legacy array format
      if (Array.isArray(parsed)) return {};
      return parsed;
    } catch {
      return {};
    }
  });
  const [customParts, setCustomParts] = useState<Part[]>(() => {
    const saved = localStorage.getItem('customParts');
    return saved ? JSON.parse(saved) : [];
  });
  const [customGroups, setCustomGroups] = useState<GroupInfo[]>(() => {
    const saved = localStorage.getItem('customGroups');
    return saved ? JSON.parse(saved) : [];
  });
  const [pinInput, setPinInput] = useState('');
  const [showLinkModal, setShowLinkModal] = useState<{ from: string } | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const isInteractingRef = useRef(false);
  const [imageBlobUrls, setImageBlobUrls] = useState<Record<string, string>>({});
  const [activeItemBlobUrl, setActiveItemBlobUrl] = useState<string | null>(null);
  const [annotationBlobUrls, setAnnotationBlobUrls] = useState<Record<string, string>>({});

  // Memoized entities for Highlight Modal to avoid repeated lookups during render
  const activeHighlightItem = useMemo(() => {
    if (!highlightState.isOpen || !focusedPart) return null;
    return selectedItems.find(i => i.part.id === focusedPart.id);
  }, [highlightState.isOpen, focusedPart, selectedItems]);

  const activeHighlightAnn = useMemo(() => {
    if (!activeHighlightItem || !highlightState.activeAnnId) return null;
    return (activeHighlightItem.annotations || []).find(a => a.id === highlightState.activeAnnId);
  }, [activeHighlightItem, highlightState.activeAnnId]);

  // Global cache for Blobs to avoid repeated decoding
  const blobCache = useRef<Map<string, string>>(new Map());
  
  const getBlobUrl = useCallback((base64: string) => {
    if (!base64 || !base64.startsWith('data:')) return base64;
    
    // Use a hash or first/last chars as key
    const key = base64.length + base64.substring(0, 50) + base64.substring(base64.length - 50);
    if (blobCache.current.has(key)) {
      return blobCache.current.get(key)!;
    }

    try {
      const parts = base64.split(',');
      const byteString = atob(parts[1]);
      const mimeString = parts[0].split(':')[1].split(';')[0];
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
      const blob = new Blob([ab], { type: mimeString });
      const url = URL.createObjectURL(blob);
      blobCache.current.set(key, url);
      return url;
    } catch (e) {
      console.error("Blob creation failed", e);
      return base64;
    }
  }, []);

  // Sync diagram Blob URLs
  useEffect(() => {
    const urls: Record<string, string> = {};
    Object.entries(diagramImages).forEach(([key, base64]) => {
      if (base64) {
        urls[key] = getBlobUrl(base64);
      }
    });
    setImageBlobUrls(urls);
  }, [diagramImages, getBlobUrl]);

  // Sync active item Blob URLs
  useEffect(() => {
    if (activeHighlightItem?.photo) {
      setActiveItemBlobUrl(getBlobUrl(activeHighlightItem.photo));
    } else {
      setActiveItemBlobUrl(null);
    }
  }, [activeHighlightItem?.photo, getBlobUrl]);

  const [localItemQuantity, setLocalItemQuantity] = useState(1);

  // Separate effect for annotation photos to avoid re-runs during move/resize
  const annPhotoKey = (activeHighlightItem?.annotations || []).filter(a => a.type === 'photo').map(a => a.id + a.photoUrl).join('|');
  const activePartId = activeHighlightItem?.part.id;

  useEffect(() => {
    if (!activeHighlightItem) {
      setAnnotationBlobUrls({});
      setLocalItemQuantity(1);
      return;
    }
    
    // Set local quantity from existing item if it exists
    const existing = selectedItems.find(i => i.part.id === activeHighlightItem.part.id);
    if (existing) {
      setLocalItemQuantity(existing.quantity || 1);
    } else {
      setLocalItemQuantity(1);
    }

    const annUrls: Record<string, string> = {};
    (activeHighlightItem.annotations || []).forEach(ann => {
      if (ann.type === 'photo' && ann.photoUrl) {
        annUrls[ann.id] = getBlobUrl(ann.photoUrl);
      }
    });
    setAnnotationBlobUrls(annUrls);
  }, [activePartId, annPhotoKey, getBlobUrl, activeHighlightItem, selectedItems]);

  const [language, setLanguage] = useState<'pt' | 'en'>(() => (localStorage.getItem('language') as 'pt' | 'en') || 'pt');
  
  const translations = {
    pt: {
      inspect: 'Inspecionar',
      order: 'Pedidos',
      damaged: 'Avarias',
      report: 'Relatório',
      projects: 'Ajustes',
      technicalReport: 'RELATÓRIO TÉCNICO',
      inspection: 'INSPEÇÃO',
      inspectionInformation: 'INFORMAÇÕES DE INSPEÇÃO',
      model: 'MODELO',
      sn: 'S/N',
      tag: 'TAG',
      delivery: 'ENTREGA',
      customer: 'CLIENTE',
      description: 'DESCRIÇÃO',
      machineDown: 'MÁQUINA PARADA?',
      reportData: 'DADOS DO RELATÓRIO',
      inspectionDate: 'DATA DIAGNÓSTICO',
      inspectorName: 'INSPETOR',
      hourMeter: 'HORÍMETRO',
      photo: 'FOTO',
      highCriticality: 'CRITICIDADE ALTA',
      mediumCriticality: 'CRITICIDADE MÉDIA',
      lowCriticality: 'CRITICIDADE BAIXA',
      partsCatalogReference: 'REFERÊNCIA DE CATÁLOGO',
      partNumber: 'PART NUMBER',
      qty: 'QTD',
      backToInspection: 'Voltar para Inspeção',
      exportPdf: 'Exportar PDF',
      clearList: 'Limpar Lista',
      pasteBom: 'Colar BOM',
      newItem: 'Novo Item',
      diagram: 'Diagrama',
      list: 'Lista',
      bom: 'BOM',
      actions: 'Ações de Inspeção',
      control: 'Controle',
      reportDamage: 'Reportar Avaria / Dano',
      criticality: 'Criticidade',
      annotations: 'Anotações',
      evidence: 'Evidências Fotográficas',
      replace: 'Substituir',
      capture: 'Capturar',
      attach: 'Anexar',
      addToOrder: 'Adicionar ao Pedido',
      details: 'Detalhes',
      delete: 'Excluir',
      noEvidence: 'Sem Evidência',
      sync: 'Sincronizado',
      saving: 'Salvando...',
      error: 'Erro!',
      search: 'Busca Geral',
      reset: 'RESET',
      orderList: 'Lista de Pedidos',
      damagedReport: 'Relatório de Avarias',
      noItems: 'Nenhum item registrado nesta lista.',
      yes: 'SIM',
      no: 'NÃO',
      deletePhoto: 'Excluir Foto',
      newInspection: 'Nova Inspeção',
      newInspectionDesc: 'Deseja iniciar um novo trabalho? O backup da inspeção atual será baixado automaticamente.',
      confirmStart: 'Confirmar e Iniciar',
      cancel: 'Cancelar',
      restrictedAccess: 'Acesso Restrito',
      restrictedAccessDesc: 'Digite a senha de desenvolvedor para continuar.',
      enter: 'Entrar',
      linkImage: 'Vincular Imagem',
      linkImageDesc: 'Selecione a sheet de destino para a imagem de',
      machineInfo: 'Informações da Máquina',
      generatePdf: 'Gerar Relatório PDF',
      machineData: 'Dados da Máquina',
      selectMachine: 'Selecionar Máquina',
      selectMachinePlaceholder: 'Selecione uma máquina...',
      reportConclusion: 'Conclusão do Relatório',
      reportConclusionPlaceholder: 'Escreva aqui a conclusão técnica da inspeção...',
      date: 'Data',
      totalItems: 'Total de Itens',
      platform: 'Plataforma',
      withPhoto: 'Com Foto',
      noPhoto: 'Sem Foto',
      errorImage: 'Erro ao processar imagem',
      status: 'Status',
      item: 'Item',
      conclusion: 'CONCLUSÃO',
      noConclusion: 'Nenhuma conclusão fornecida.',
      partsList: 'LISTA DE PEÇAS',
      partName: 'NOME DA PEÇA',
      associatedPhoto: 'FOTO ASSOCIADA',
      original: 'Original',
      end: 'FIM',
      safeMessage1: '"SE NÃO É SEGURO, NÃO FAÇA!"',
      safeMessage2: '"NÃO HÁ NADA TÃO IMPORTANTE E URGENTE QUE NÃO POSSA SER FEITO COM SEGURANÇA"',
      newInspectionTooltip: 'Nova Inspeção (Salva Atual e Limpa)',
      viewModeTooltip: 'Modo Visualização',
      editModeTooltip: 'Modo Edição de Imagem',
      switchToEnglish: 'Mudar para Inglês',
      switchToPortuguese: 'Mudar para Português',
      hideDetailsTooltip: 'Ocultar Detalhes (Imagem Maior)',
      showDetailsTooltip: 'Mostrar Detalhes',
      inspectorData: 'Dados do Inspetor',
      newSheetPrompt: 'Nome da nova sheet:',
      addSheet: 'Adicionar Sheet'
    },
    en: {
      inspect: 'Inspect',
      order: 'Orders',
      damaged: 'Damages',
      report: 'Report',
      projects: 'Settings',
      technicalReport: 'TECHNICAL REPORT',
      inspection: 'INSPECTION',
      inspectionInformation: 'INSPECTION INFORMATION',
      model: 'MODEL',
      sn: 'S/N',
      tag: 'TAG',
      delivery: 'DELIVERY',
      customer: 'CUSTOMER',
      description: 'DESCRIPTION',
      machineDown: 'MACHINE DOWN?',
      reportData: 'REPORT DATA',
      inspectionDate: 'INSPECTION DATE',
      inspectorName: 'INSPECTOR',
      hourMeter: 'HOUR METER',
      photo: 'PHOTO',
      highCriticality: 'HIGH CRITICALITY',
      mediumCriticality: 'MEDIUM CRITICALITY',
      lowCriticality: 'LOW CRITICALITY',
      partsCatalogReference: 'PARTS CATALOG REFERENCE',
      partNumber: 'PART NUMBER',
      qty: 'QTY',
      backToInspection: 'Back to Inspection',
      exportPdf: 'Export PDF',
      clearList: 'Clear List',
      pasteBom: 'Paste BOM',
      newItem: 'New Item',
      diagram: 'Diagram',
      list: 'List',
      bom: 'BOM',
      actions: 'Inspection Actions',
      control: 'Control',
      reportDamage: 'Report Damage / Issue',
      criticality: 'Criticality',
      annotations: 'Annotations',
      evidence: 'Evidence Photos',
      replace: 'Replace',
      capture: 'Capture',
      attach: 'Attach',
      addToOrder: 'Add to Order',
      details: 'Details',
      delete: 'Delete',
      noEvidence: 'No Evidence',
      sync: 'Synced',
      saving: 'Saving...',
      error: 'Error!',
      search: 'General Search',
      reset: 'RESET',
      orderList: 'Order List',
      damagedReport: 'Damage Report',
      noItems: 'No items registered in this list.',
      yes: 'YES',
      no: 'NO',
      deletePhoto: 'Delete Photo',
      newInspection: 'New Inspection',
      newInspectionDesc: 'Do you want to start a new job? The current inspection backup will be downloaded automatically.',
      confirmStart: 'Confirm and Start',
      cancel: 'Cancel',
      restrictedAccess: 'Restricted Access',
      restrictedAccessDesc: 'Enter the developer password to continue.',
      enter: 'Enter',
      linkImage: 'Link Image',
      linkImageDesc: 'Select the destination sheet for the image of',
      machineInfo: 'Machine Information',
      generatePdf: 'Generate PDF Report',
      machineData: 'Machine Data',
      selectMachine: 'Select Machine',
      selectMachinePlaceholder: 'Select a machine...',
      reportConclusion: 'Report Conclusion',
      reportConclusionPlaceholder: 'Write the technical conclusion of the inspection here...',
      date: 'Date',
      totalItems: 'Total Items',
      platform: 'Platform',
      withPhoto: 'With Photo',
      noPhoto: 'No Photo',
      errorImage: 'Error processing image',
      status: 'Status',
      item: 'Item',
      conclusion: 'CONCLUSION',
      noConclusion: 'No conclusion provided.',
      partsList: 'PARTS LIST',
      partName: 'PART NAME',
      associatedPhoto: 'ASSOCIATED PHOTO',
      original: 'Original',
      end: 'END',
      safeMessage1: '"IF IT\'S NOT SAFE, DON\'T DO IT!"',
      safeMessage2: '"THERE IS NOTHING SO IMPORTANT AND URGENT THAT IT CAN\'T BE DONE SAFELY"',
      newInspectionTooltip: 'New Inspection (Save Current and Clear)',
      viewModeTooltip: 'View Mode',
      editModeTooltip: 'Image Edit Mode',
      switchToEnglish: 'Switch to English',
      switchToPortuguese: 'Switch to Portuguese',
      hideDetailsTooltip: 'Hide Details (Larger Image)',
      showDetailsTooltip: 'Show Details',
      inspectorData: 'Inspector Data',
      newSheetPrompt: 'New sheet name:',
      addSheet: 'Add Sheet'
    }
  };

  const t = (key: keyof typeof translations['pt']) => translations[language][key] || key;

  // Dragging Annotation State
  const [draggingAnnId, setDraggingAnnId] = useState<string | null>(null);
  const [resizingAnnId, setResizingAnnId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isHighlightDragging, setIsHighlightDragging] = useState(false);
  const interactionRectRef = useRef<DOMRect | null>(null);

  // Load images from IndexedDB on mount and migrate from localStorage if needed
  useEffect(() => {
    const initStorage = async () => {
      try {
        const savedImages = await storage.getImages();
        const savedAnnotations = await storage.getAnnotations();
        const savedSelectedItems = await storage.getSelectedItems();
        
        // Migration from localStorage
        const legacyImages = localStorage.getItem('diagramImages');
        const legacyAnnotations = localStorage.getItem('diagramAnnotations');
        const legacySelectedItems = localStorage.getItem('selectedItems');

        if (legacyImages && Object.keys(savedImages).length === 0) {
          const parsed = JSON.parse(legacyImages);
          await storage.saveImages(parsed);
          setDiagramImages(parsed);
          localStorage.removeItem('diagramImages');
        } else {
          setDiagramImages(savedImages);
        }

        if (legacyAnnotations && Object.keys(savedAnnotations).length === 0) {
          const parsed = JSON.parse(legacyAnnotations);
          await storage.saveAnnotations(parsed);
          setDiagramAnnotations(parsed);
          localStorage.removeItem('diagramAnnotations');
        } else {
          setDiagramAnnotations(savedAnnotations);
        }

        if (legacySelectedItems && savedSelectedItems.length === 0) {
          const parsed = JSON.parse(legacySelectedItems);
          await storage.saveSelectedItems(parsed);
          setSelectedItems(parsed);
          localStorage.removeItem('selectedItems');
        } else {
          setSelectedItems(savedSelectedItems);
        }

        setIsStorageReady(true);
      } catch (e) {
        console.error('Failed to initialize storage', e);
        setIsStorageReady(true); // Still set ready to allow app to function
      }
    };
    initStorage();
  }, []);
  const [activeTab, setActiveTab] = useState<'inspect' | 'order' | 'damaged' | 'projects' | 'report'>('report');
  const [projectName, setProjectName] = useState(() => localStorage.getItem('projectName') || 'Nova Inspeção');
  const [adminPin, setAdminPin] = useState(() => localStorage.getItem('adminPin') || '1234');
  
  // Annotation State
  const [activeTool, setActiveTool] = useState<AnnotationType>('none');
  const [activeColor, setActiveColor] = useState('#f27d26'); // Landcros Orange default
  const [isDiagramToolbarVisible, setIsDiagramToolbarVisible] = useState(true);
  const [isHighlightToolbarVisible, setIsHighlightToolbarVisible] = useState(true);
  const [diagramAnnotations, setDiagramAnnotations] = useState<Record<string, Annotation[]>>({});

  // Save tracking to prevent multiple concurrent saves
  const isSavingRef = useRef(false);

  // Save to localStorage whenever state changes
  useEffect(() => {
    localStorage.setItem('savedConfigs', JSON.stringify(savedConfigs));
  }, [savedConfigs]);

  useEffect(() => {
    if (!isAdmin) {
      setIsAdjusting(false);
      setIsEditMode(false);
      // Load saved configs into current configs when exiting admin mode
      setImgConfigs(prev => {
        const next = { ...prev };
        Object.keys(savedConfigs).forEach(cat => {
          next[cat] = savedConfigs[cat];
        });
        return next;
      });
    }
  }, [isAdmin, savedConfigs]);

  useEffect(() => {
    if (!isStorageReady) return;

    const save = async () => {
      if (isSavingRef.current || isInteractingRef.current || highlightState.isOpen) {
        console.log('Skipping auto-save: interacting, modal open, or already saving');
        return;
      }
      
      try {
        isSavingRef.current = true;
        setSaveStatus('saving');
        
        console.log('Auto-saving data...');
        // Save large data to IndexedDB
        await Promise.all([
          storage.saveImages(diagramImages),
          storage.saveAnnotations(diagramAnnotations),
          storage.saveSelectedItems(selectedItems)
        ]);
        
        // Save other configs to localStorage (small data)
        const storageData = {
          imgConfigs: JSON.stringify(imgConfigs),
          imgFilters: JSON.stringify(imgFilters),
          inspectionInfo: JSON.stringify(inspectionInfo),
          projectName,
          adminPin,
          customCategories: JSON.stringify(customCategories),
          customParts: JSON.stringify(customParts)
        };

        localStorage.setItem('imgConfigs', storageData.imgConfigs);
        localStorage.setItem('imgFilters', storageData.imgFilters);
        localStorage.setItem('inspectionInfo', storageData.inspectionInfo);
        localStorage.setItem('projectName', storageData.projectName);
        localStorage.setItem('adminPin', storageData.adminPin);
        localStorage.setItem('customCategories', storageData.customCategories);
        localStorage.setItem('customParts', storageData.customParts);
        
        setSaveStatus('saved');
      } catch (e) {
        console.error('Storage error during auto-save:', e);
        setSaveStatus('error');
      } finally {
        isSavingRef.current = false;
      }
    };
    
    // Increased debounce to 3s to allow user to finish modifications before major serialization
    const timeout = setTimeout(save, 3000);
    return () => clearTimeout(timeout);
  }, [diagramImages, imgConfigs, selectedItems, projectName, customCategories, customParts, isStorageReady, adminPin, diagramAnnotations, imgFilters, inspectionInfo, highlightState.isOpen]);

  const exportProject = () => {
    const data = {
      projectName,
      diagramImages,
      imgConfigs,
      imgFilters,
      selectedItems,
      customCategories,
      inspectionInfo,
      version: '1.2'
    };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.landcros`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.diagramImages) setDiagramImages(data.diagramImages);
        if (data.imgConfigs) setImgConfigs(data.imgConfigs);
        if (data.selectedItems) setSelectedItems(data.selectedItems);
        if (data.imgFilters) setImgFilters(data.imgFilters);
        if (data.customCategories) setCustomCategories(data.customCategories);
        if (data.inspectionInfo) setInspectionInfo(data.inspectionInfo);
        if (data.projectName) setProjectName(data.projectName);
        alert('Projeto importado com sucesso!');
      } catch (err) {
        alert('Erro ao importar projeto. Arquivo inválido.');
      }
    };
    reader.readAsText(file);
  };

  const startNewProject = () => {
    // Auto-export before clearing
    exportProject();
    
    // Clear inspection data
    setSelectedItems([]);
    setFocusedPart(null);
    setSearchTerm('');
    setCustomCategories({});
    setCustomGroups([]);
    
    // Reset project name with new date/time
    const now = new Date();
    setProjectName('Inspeção ' + now.toLocaleDateString() + ' ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    
    // Reset view to inspection mode and lock admin
    setActiveTab('inspect');
    setIsAdmin(false);
    setIsEditMode(false);
    setShowNewProjectModal(false);
    setDiagramImages({});
    
    alert('Nova inspeção iniciada. O backup da anterior foi salvo na sua pasta de downloads.');
  };

  const toggleAdmin = () => {
    if (isAdmin) {
      setIsAdmin(false);
      setIsEditMode(false);
      setIsAdjusting(false);
      if (activeTab === 'projects') setActiveTab('inspect');
      return;
    }
    setPinInput('');
    setShowPinModal(true);
  };

  const handlePinSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    const trimmedPin = pinInput.trim();
    const currentPin = adminPin.trim();

    if (trimmedPin === currentPin || trimmedPin === 'RESET_PIN_MASTER') {
      if (trimmedPin === 'RESET_PIN_MASTER') {
        setAdminPin('1234');
        alert('Senha resetada para o padrão: 1234');
      }
      setIsAdmin(true);
      setShowPinModal(false);
      alert('Modo Desenvolvedor Ativado!');
    } else {
      alert('Senha Incorreta. Acesso negado.');
      setPinInput('');
    }
  };

  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const isStartingCamera = React.useRef(false);

  const startCamera = useCallback(async () => {
    if (isStartingCamera.current) return;
    isStartingCamera.current = true;
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("Seu navegador não suporta acesso à câmera.");
      setIsCameraOpen(false);
      isStartingCamera.current = false;
      return;
    }
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: facingMode }, 
        audio: false 
      });
      setCameraStream(stream);
    } catch (err) {
      console.error("Error accessing camera:", err);
      if (isCameraOpen) {
        alert("Não foi possível acessar a câmera. Verifique as permissões.");
        setIsCameraOpen(false);
      }
    } finally {
      isStartingCamera.current = false;
    }
  }, [facingMode, isCameraOpen]);

  const toggleCamera = () => {
    const newMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newMode);
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
  };

  useEffect(() => {
    if (isCameraOpen && !cameraStream) {
      startCamera();
    }
  }, [facingMode, isCameraOpen, cameraStream, startCamera]);

  useEffect(() => {
    if (isCameraOpen && videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [isCameraOpen, cameraStream]);

  const stopCamera = useCallback(() => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setIsCameraOpen(false);
  }, [cameraStream]);

  const capturePhoto = async () => {
    if (videoRef.current && videoRef.current.videoWidth > 0) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0);
        try {
          const rawUrl = canvas.toDataURL('image/jpeg', 0.8);
          const dataUrl = await compressImage(rawUrl);
          if (focusedPart) {
            setSelectedItems(prev => {
              const exists = prev.find(i => i.part.id === focusedPart.id);
              if (exists) {
                return prev.map(item => 
                  item.part.id === focusedPart.id ? { ...item, photo: dataUrl } : item
                );
              }
              const newItem: SelectedItem = {
                part: focusedPart,
                type: 'damaged',
                timestamp: Date.now(),
                photo: dataUrl,
                quantity: 1
              };
              return [...prev, newItem];
            });
            // Stop camera and close modal after successful capture
            stopCamera();
          } else {
            console.warn("No focusedPart found during capture");
            stopCamera();
          }
        } catch (err) {
          console.error("Error capturing photo:", err);
          alert("Erro ao capturar foto. Tente novamente.");
        }
      }
    } else {
      console.warn("Video not ready for capture");
    }
  };

  const deleteInspectionPhoto = () => {
    if (focusedPart) {
      if (confirm(language === 'pt' ? 'Deseja excluir permanentemente esta foto e suas anotações?' : 'Do you want to permanently delete this photo and its annotations?')) {
        setSelectedItems(prev => 
          prev.map(item => 
            (item.part.id === focusedPart.id) ? { ...item, photo: undefined, annotations: [] } : item
          )
        );
      }
    }
  };

  const handleInspectionPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && focusedPart) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const rawUrl = event.target?.result as string;
        const dataUrl = await compressImage(rawUrl);
        setSelectedItems(prev => {
          const exists = prev.find(i => i.part.id === focusedPart.id);
          if (exists) {
            return prev.map(item => 
              item.part.id === focusedPart.id ? { ...item, photo: dataUrl } : item
            );
          }
          return [...prev, {
            part: focusedPart,
            type: 'damaged',
            timestamp: Date.now(),
            photo: dataUrl,
            quantity: 1
          }];
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleMachineChange = (tag: string) => {
    const machine = MACHINE_DATABASE.find(m => m.tag === tag);
    if (machine) {
      setInspectionInfo(prev => ({
        ...prev,
        tag: machine.tag,
        model: machine.model,
        sn: machine.sn,
        delivery: machine.delivery
      }));
    } else {
      setInspectionInfo(prev => ({ ...prev, tag }));
    }
  };

  const handleResetZoom = () => {
    const saved = savedConfigs[selectedCategory] || { scale: 1, x: 0, y: 0 };
    setImgConfigs(prev => ({ ...prev, [selectedCategory]: saved }));
  };

  const saveCurrentAsMaster = () => {
    const current = imgConfigs[selectedCategory] || { scale: 1, x: 0, y: 0 };
    setSavedConfigs(prev => ({ ...prev, [selectedCategory]: current }));
    setSaveStatus('saving');
    setTimeout(() => setSaveStatus('saved'), 500);
    alert('Configuração Mestre salva para esta categoria!');
  };

  const currentImg = diagramImages[selectedCategory] || null;
  const currentConfig = imgConfigs[selectedCategory] || savedConfigs[selectedCategory] || { scale: 1, x: 0, y: 0, isLocked: false };
  const currentFilters = imgFilters[selectedCategory] || { brightness: 100, contrast: 100, grayscale: 0 };

  const allGroups = useMemo(() => [...CATALOG_STRUCTURE, ...customGroups], [customGroups]);

  const categories = useMemo(() => {
    const group = allGroups.find(g => g.name === selectedGroup);
    if (!group) return [];
    return group.sheets.map(s => s.name);
  }, [selectedGroup, allGroups]);

  const currentSheet = useMemo(() => {
    const group = allGroups.find(g => g.name === selectedGroup);
    return group?.sheets.find(s => s.name === selectedCategory);
  }, [allGroups, selectedGroup, selectedCategory]);

  const innerContainerRef = React.useRef<HTMLDivElement>(null);
  const annotationFileRef = React.useRef<HTMLInputElement>(null);
  const [pendingAnnotation, setPendingAnnotation] = useState<{ x: number, y: number, isDiagram: boolean, itemId?: string, itemType?: ListType } | null>(null);

  const handleAddGroup = (name: string) => {
    if (!name.trim()) return;
    const newGroup: GroupInfo = {
      id: `group-${Date.now()}`,
      name: name.trim().toUpperCase(),
      sheets: []
    };
    setCustomGroups(prev => [...prev, newGroup]);
    setSelectedGroup(newGroup.name);
  };

  const handleDeleteGroup = (groupName: string) => {
    if (CATALOG_STRUCTURE.some(g => g.name === groupName)) {
      alert('Não é possível excluir grupos padrão do sistema.');
      return;
    }
    if (confirm(`Deseja excluir permanentemente o grupo "${groupName}" e todas as suas sheets customizadas?`)) {
      setCustomGroups(prev => prev.filter(g => g.name !== groupName));
      setCustomCategories(prev => {
        const next = { ...prev };
        delete next[groupName];
        return next;
      });
      if (selectedGroup === groupName) {
        setSelectedGroup(CATALOG_STRUCTURE[0].name);
        setSelectedCategory(CATALOG_STRUCTURE[0].sheets[0].name);
      }
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const rawUrl = reader.result as string;
        const dataUrl = await compressImage(rawUrl, 2000, 0.8);
        setDiagramImages(prev => ({ ...prev, [selectedCategory]: dataUrl }));
        setImgConfigs(prev => ({ ...prev, [selectedCategory]: { scale: 1, x: 0, y: 0 } }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleLinkCategory = (targetSheet: string) => {
    if (!showLinkModal) return;
    const sourceCat = showLinkModal.from;
    
    // Move image
    const image = diagramImages[sourceCat];
    if (image) {
      setDiagramImages(prev => ({ ...prev, [targetSheet]: image }));
    }
    
    // Move annotations
    const anns = diagramAnnotations[sourceCat];
    if (anns) {
      setDiagramAnnotations(prev => ({ ...prev, [targetSheet]: anns }));
    }

    // Remove custom category from current group
    setCustomCategories(prev => {
      const next = { ...prev };
      if (next[selectedGroup]) {
        next[selectedGroup] = next[selectedGroup].filter(c => c !== sourceCat);
      }
      return next;
    });
    
    setDiagramImages(prev => {
      const next = { ...prev };
      delete next[sourceCat];
      return next;
    });

    setDiagramAnnotations(prev => {
      const next = { ...prev };
      delete next[sourceCat];
      return next;
    });
    
    setShowLinkModal(null);
    setSelectedCategory(targetSheet);
    alert(`Imagem vinculada com sucesso à sheet: ${targetSheet}`);
  };

  const handleDiagramClick = (e: React.MouseEvent<HTMLDivElement>) => {
    isInteractingRef.current = true;
    if (activeTool === 'none') {
      isInteractingRef.current = false;
      return;
    }
    
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - rect.left - (rect.width / 2)) / currentConfig.scale) - currentConfig.x + (rect.width / 2);
    const my = ((e.clientY - rect.top - (rect.height / 2)) / currentConfig.scale) - currentConfig.y + (rect.height / 2);

    // Percent relative coordinates (normalized 0-1000)
    const px = (mx / rect.width) * 1000;
    const py = (my / rect.height) * 1000;

    if (activeTool === 'eraser') {
      // Find annotation near click
      const nearAnn = (diagramAnnotations[selectedCategory] || []).find(a => 
        Math.abs(a.x - px) < 30 && Math.abs(a.y - py) < 30
      );
      if (nearAnn) {
        removeAnnotation(nearAnn.id);
        setTimeout(() => { isInteractingRef.current = false; }, 500);
        return;
      }
    }

    if (activeTool === 'photo') {
      setPendingAnnotation({ x: px, y: py, isDiagram: true });
      annotationFileRef.current?.click();
      setTimeout(() => { isInteractingRef.current = false; }, 500);
      return;
    }

    const newAnn: Annotation = {
      id: `ann-${Date.now()}`,
      type: activeTool,
      x: px,
      y: py,
      width: activeTool === 'arrow' ? 80 : 100,
      height: activeTool === 'text' || activeTool === 'callout' ? 40 : 100,
      rotation: 0,
      color: activeColor,
      dash: activeTool === 'leader',
      fontSize: 14
    };

    if (activeTool === 'text' || activeTool === 'callout') {
      const val = prompt(activeTool === 'text' ? 'Digite o texto:' : 'Digite a letra/número do Callout:');
      if (!val) {
        isInteractingRef.current = false;
        return;
      }
      newAnn.text = val.toUpperCase();
    }

    setDiagramAnnotations(prev => ({
      ...prev,
      [selectedCategory]: [...(prev[selectedCategory] || []), newAnn]
    }));
    setTimeout(() => { isInteractingRef.current = false; }, 500);
  };

  const updateAnnotation = useCallback((id: string, updates: Partial<Annotation>) => {
    isInteractingRef.current = true;
    setDiagramAnnotations(prev => {
      const currentList = prev[selectedCategory] || [];
      const updatedList = currentList.map(a => 
        a.id === id ? { ...a, ...updates } : a
      );
      if (currentList === updatedList) return prev;
      return {
        ...prev,
        [selectedCategory]: updatedList
      };
    });
    // Set a timeout to release interaction lock shortly after update
    setTimeout(() => { isInteractingRef.current = false; }, 500);
  }, [selectedCategory]);

  const removeAnnotation = (id: string) => {
    setDiagramAnnotations(prev => ({
      ...prev,
      [selectedCategory]: (prev[selectedCategory] || []).filter(a => a.id !== id)
    }));
  };

  const handleBulkImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newCats: string[] = [];
    const newImages: Record<string, string> = {};
    
    // Get all existing categories across all groups to check for matches
    const allSheets = allGroups.flatMap(g => g.sheets.map(s => s.name));
    const allSheetNamesUpper = allSheets.map(s => s.toUpperCase());

    const processFile = (file: File) => {
      return new Promise<void>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = async () => {
          const rawUrl = reader.result as string;
          const base64 = await compressImage(rawUrl);
          const fileName = file.name.split('.')[0].toUpperCase();
          
          // Find if this filename matches any existing sheet name (case insensitive)
          const sheetIndex = allSheetNamesUpper.indexOf(fileName);
          
          if (sheetIndex !== -1) {
            // It matches an existing sheet!
            const originalName = allSheets[sheetIndex];
            newImages[originalName] = base64;
          } else {
            // It doesn't match any existing sheet. 
            // Create a new custom category for the CURRENT group
            let finalName = fileName;
            let counter = 1;
            const currentGroupCustoms = customCategories[selectedGroup] || [];
            
            while (
              categories.includes(finalName) || 
              newCats.includes(finalName) || 
              currentGroupCustoms.includes(finalName)
            ) {
              finalName = `${fileName}_${counter}`;
              counter++;
            }
            newCats.push(finalName);
            newImages[finalName] = base64;
          }
          resolve();
        };
        reader.readAsDataURL(file);
      });
    };

    await Promise.all(Array.from(files).map(processFile));
    
    if (newCats.length > 0) {
      setCustomCategories(prev => ({
        ...prev,
        [selectedGroup]: [...(prev[selectedGroup] || []), ...newCats]
      }));
    }
    setDiagramImages(prev => ({ ...prev, ...newImages }));
    alert(`${files.length} fotos processadas com sucesso no grupo ${selectedGroup}!`);
  };

  const handleWheel = (e: React.WheelEvent) => {
    const delta = e.deltaY;
    const scaleStep = 0.1; // Increased for better feel
    const minScale = 0.5;
    const maxScale = 15;

    setImgConfigs(prev => {
      const current = prev[selectedCategory] || { scale: 1, x: 0, y: 0 };
      const newScale = delta > 0 
        ? Math.max(minScale, current.scale - scaleStep) 
        : Math.min(maxScale, current.scale + scaleStep);
      
      return {
        ...prev,
        [selectedCategory]: { ...current, scale: parseFloat(newScale.toFixed(2)) }
      };
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    isInteractingRef.current = true;
    if (activeTool !== 'none') return;
    if (e.button === 0 && (e.altKey || currentConfig.scale > 1)) {
      setIsPanning(true);
      setLastMousePos({ x: e.clientX, y: e.clientY });
    }
  };

  const handleAnnMouseDown = (e: React.MouseEvent, ann: Annotation) => {
    isInteractingRef.current = true;
    e.stopPropagation();
    setDraggingAnnId(ann.id);
    setIsHighlightDragging(highlightState.isOpen);
    
    // We need to know which container we are in to calculate coordinates correctly
    const container = highlightState.isOpen ? highlightModalRef.current : diagramContainerRef.current;
    const rect = container?.getBoundingClientRect();
    if (!rect) return;
    interactionRectRef.current = rect;
    
    // For highlight modal, we use fixed 1000x1000 viewBox coordinate system
    if (highlightState.isOpen) {
      const px = (e.clientX - rect.left) / rect.width * 1000;
      const py = (e.clientY - rect.top) / rect.height * 1000;
      setDragOffset({ x: px - ann.x, y: py - ann.y });
    } else {
      const mx = ((e.clientX - rect.left - (rect.width / 2)) / currentConfig.scale) - currentConfig.x + (rect.width / 2);
      const my = ((e.clientY - rect.top - (rect.height / 2)) / currentConfig.scale) - currentConfig.y + (rect.height / 2);
      const px = (mx / rect.width) * 1000;
      const py = (my / rect.height) * 1000;
      setDragOffset({ x: px - ann.x, y: py - ann.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggingAnnId) {
      if (isHighlightDragging && activeHighlightItem) {
        const rect = interactionRectRef.current;
        if (!rect) return;
        const px = (e.clientX - rect.left) / rect.width * 1000;
        const py = (e.clientY - rect.top) / rect.height * 1000;
        
        const newX = px - dragOffset.x;
        const newY = py - dragOffset.y;
        
        const updated = (activeHighlightItem.annotations || []).map(a => 
          a.id === draggingAnnId ? { ...a, x: newX, y: newY } : a
        );
        updateItemAnnotations(activeHighlightItem.part.id, activeHighlightItem.type, updated);
        return;
      }

      const rect = interactionRectRef.current || diagramContainerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const mx = ((e.clientX - rect.left - (rect.width / 2)) / currentConfig.scale) - currentConfig.x + (rect.width / 2);
      const my = ((e.clientY - rect.top - (rect.height / 2)) / currentConfig.scale) - currentConfig.y + (rect.height / 2);
      const px = (mx / rect.width) * 1000;
      const py = (my / rect.height) * 1000;

      updateAnnotation(draggingAnnId, { 
        x: px - dragOffset.x, 
        y: py - dragOffset.y 
      });
      return;
    }

    if (resizingAnnId) {
      const rect = diagramContainerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const mx = ((e.clientX - rect.left - (rect.width / 2)) / currentConfig.scale) - currentConfig.x + (rect.width / 2);
      const my = ((e.clientY - rect.top - (rect.height / 2)) / currentConfig.scale) - currentConfig.y + (rect.height / 2);
      const px = (mx / rect.width) * 1000;
      const py = (my / rect.height) * 1000;
      
      const ann = (diagramAnnotations[selectedCategory] || []).find(a => a.id === resizingAnnId);
      if (ann) {
        const dx = px - ann.x;
        const dy = py - ann.y;
        
        if (ann.type === 'arrow') {
          const newWidth = Math.max(20, Math.sqrt(dx*dx + dy*dy));
          const newRotation = Math.atan2(dy, dx);
          updateAnnotation(resizingAnnId, { 
            width: newWidth,
            rotation: newRotation
          });
        } else {
          const newSize = Math.max(20, Math.sqrt(dx*dx + dy*dy) * 2);
          updateAnnotation(resizingAnnId, { 
            width: newSize,
            height: newSize 
          });
        }
      }
      return;
    }

    if (!isPanning) return;

    const dx = e.clientX - lastMousePos.x;
    const dy = e.clientY - lastMousePos.y;

    setImgConfigs(prev => {
      const current = prev[selectedCategory] || { scale: 1, x: 0, y: 0 };
      return {
        ...prev,
        [selectedCategory]: { 
          ...current, 
          x: current.x + dx / current.scale, 
          y: current.y + dy / current.scale 
        }
      };
    });

    setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = useCallback(() => {
    isInteractingRef.current = false;
    setIsPanning(false);
    setDraggingAnnId(null);
    setResizingAnnId(null);
    setIsHighlightDragging(false);
    interactionRectRef.current = null;
  }, []);

  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseUp]);

  const handleDeleteImage = () => {
    if (currentConfig.isLocked) {
      alert('A imagem está travada. Desbloqueie para poder excluir.');
      return;
    }
    setDiagramImages(prev => ({ ...prev, [selectedCategory]: null }));
    setImgConfigs(prev => ({ ...prev, [selectedCategory]: { scale: 1, x: 0, y: 0 } }));
    setIsAdjusting(false);
  };

  const filteredParts = useMemo(() => {
    const all = [...PARTS_DATA, ...customParts].filter(p => p.group === selectedGroup && p.category === selectedCategory);

    return all.filter(part => {
      const matchesSearch = 
        part.partNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        part.description.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesSearch;
    });
  }, [searchTerm, selectedGroup, selectedCategory, customParts]);

  const handleAnnotationPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !pendingAnnotation) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = await compressImage(reader.result as string);
      
      const newAnn: Annotation = {
        id: `ann-${Date.now()}`,
        type: 'photo',
        x: pendingAnnotation.x,
        y: pendingAnnotation.y,
        width: 150,
        height: 150,
        rotation: 0,
        color: activeColor,
        photoUrl: base64,
        strokeWidth: 4
      };

      if (pendingAnnotation.isDiagram) {
        setDiagramAnnotations(prev => ({
          ...prev,
          [selectedCategory]: [...(prev[selectedCategory] || []), newAnn]
        }));
      } else if (pendingAnnotation.itemId && pendingAnnotation.itemType) {
        const item = selectedItems.find(i => i.part.id === pendingAnnotation.itemId && i.type === pendingAnnotation.itemType);
        if (item) {
          updateItemAnnotations(item.part.id, item.type, [...(item.annotations || []), newAnn]);
        }
      }
      
      setPendingAnnotation(null);
      setActiveTool('none');
      if (e.target) e.target.value = '';
    };
    reader.readAsDataURL(file);
  };

  const clearCurrentCategoryParts = () => {
    // Only allow clearing custom parts
    const hasCustom = customParts.some(p => p.sheet === selectedCategory);
    if (!hasCustom) {
      alert('Não existem peças customizadas para limpar nesta sheet.');
      return;
    }

    if (confirm(`Deseja excluir permanentemente todas as ${customParts.filter(p => p.sheet === selectedCategory).length} peças customizadas/importadas desta sheet?`)) {
      setCustomParts(prev => prev.filter(p => p.sheet !== selectedCategory));
    }
  };

  const deleteCustomPart = (id: string) => {
    setCustomParts(prev => prev.filter(p => p.id !== id));
    // Also remove from selected items if it was there
    setSelectedItems(prev => prev.filter(item => item.part.id !== id));
  };

  const addNewCustomPart = () => {
    const pNumber = prompt('Part Number:');
    if (!pNumber) return;
    const desc = prompt('Descrição:');
    if (desc === null) return;
    
    const newItem: Part = {
      id: `custom-${Date.now()}`,
      sheet: selectedCategory,
      group: selectedGroup,
      category: selectedCategory,
      itemNumber: '++',
      partNumber: pNumber,
      description: desc || 'PERSONALIZADO'
    };

    setCustomParts(prev => [...prev, newItem]);
  };

  const handleImportBom = () => {
    const lines = bomInput.split('\n').filter(l => l.trim());
    let imported = 0;
    let skipped = 0;

    const newParts: Part[] = lines.map((line, index) => {
      // Try tab first (Excel)
      let parts = line.split('\t').map(p => p.trim());
      
      // If only one part, try semicolon or comma
      if (parts.length < 2) {
        parts = line.split(/[;,]/).map(p => p.trim());
      }

      // If still < 2, fallback to whitespace (but respect double spaces as potential delimiters)
      if (parts.length < 2) {
        // Regex to split by multiple spaces or single tab
        parts = line.split(/\s{2,}|\t/).map(p => p.trim());
      }

      // If still only 1 part, basic split by space
      if (parts.length < 2) {
        parts = line.split(/\s+/).map(p => p.trim());
      }

      // Skip header lines
      const isHeader = parts.some(p => 
        ['item', 'part', 'number', 'description', 'peça', 'descrição'].includes(p.toLowerCase())
      );
      if (isHeader) {
        skipped++;
        return null;
      }

      if (parts.length >= 2) {
        let itemNum = '';
        let partNum = '';
        let desc = '';

        if (parts.length === 2) {
          // Assume [PartNumber] [Description]
          partNum = parts[0];
          desc = parts[1];
          itemNum = (index + 1).toString().padStart(2, '0');
        } else if (parts.length >= 3) {
          // Assume [ItemNumber] [PartNumber] [Description...]
          itemNum = parts[0];
          partNum = parts[1];
          desc = parts.slice(2).join(' ');
        }

        imported++;
        return {
          id: `custom-${Date.now()}-${index}`,
          sheet: selectedCategory,
          group: selectedGroup,
          category: selectedCategory,
          itemNumber: itemNum,
          partNumber: partNum,
          description: desc
        };
      }
      
      skipped++;
      return null;
    }).filter((p): p is Part => p !== null);

    if (newParts.length > 0) {
      setCustomParts(prev => [...prev, ...newParts]);
      setBomInput('');
      setShowBomModal(false);
      alert(`${newParts.length} itens importados com sucesso!${skipped > 0 ? ` (${skipped} linhas ignoradas/cabeçalho)` : ''}`);
    } else {
      alert('Não foi possível identificar nenhuma peça no formato esperado. Tente copiar colunas de uma tabela.');
    }
  };

  const copyGroupPhotosToSheets = () => {
    let count = 0;
    const all = [...PARTS_DATA, ...customParts];
    const itemsInGroup = selectedItems.filter(item => {
      const part = all.find(p => p.id === item.part.id);
      return part && part.group === selectedGroup && item.photo;
    });

    itemsInGroup.forEach(item => {
      if (item.photo) {
        setDiagramImages(prev => ({
          ...prev,
          [item.part.category]: item.photo
        }));
        count++;
      }
    });

    if (count > 0) {
      alert(`${count} fotos foram vinculadas como imagens de referência para suas respectivas sheets.`);
    } else {
      alert('Nenhuma foto encontrada nas inspeções deste grupo para vincular.');
    }
  };

  const toggleItem = (part: Part, type: ListType) => {
    setSelectedItems(prev => {
      const exists = prev.find(item => item.part.id === part.id && item.type === type);
      if (exists) {
        return prev.filter(item => !(item.part.id === part.id && item.type === type));
      } else {
        return [...prev, { 
          part, 
          type, 
          timestamp: Date.now(),
          quantity: 1,
          criticality: type === 'damaged' ? 'C' : null,
          annotations: []
        }];
      }
    });
  };

  const duplicateItem = (part: Part, type: ListType) => {
    setSelectedItems(prev => [...prev, { 
      part: { ...part, id: `${part.id}-copy-${Date.now()}` },
      type, 
      timestamp: Date.now(),
      quantity: 1,
      criticality: type === 'damaged' ? 'C' : null,
      annotations: []
    }]);
  };

  const updateItemQuantity = (partId: string, delta: number) => {
    setSelectedItems(prev => prev.map(item => {
      if (item.part.id === partId) {
        return { ...item, quantity: Math.max(1, (item.quantity || 1) + delta) };
      }
      return item;
    }));
  };

  const updateItemCriticality = (partId: string, type: ListType, criticality: Criticality) => {
    setSelectedItems(prev => prev.map(item => {
      if (item.part.id === partId && item.type === type) {
        return { ...item, criticality };
      }
      return item;
    }));
  };

  // Throttled update for annotations to keep UI responsive
  const updateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateItemAnnotations = useCallback((partId: string, type: ListType, annotations: Annotation[]) => {
    isInteractingRef.current = true;
    
    // Clear previous if any
    if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current);

    // Immediate update for UI responsiveness
    setSelectedItems(prev => {
      const index = prev.findIndex(item => item.part.id === partId && item.type === type);
      if (index === -1) return prev;
      const newItems = [...prev];
      newItems[index] = { ...prev[index], annotations };
      return newItems;
    });

    // Release interaction lock after a delay
    updateTimeoutRef.current = setTimeout(() => {
      isInteractingRef.current = false;
      updateTimeoutRef.current = null;
    }, 500);
  }, []);

  const isSelected = (partId: string, type: ListType) => {
    return selectedItems.some(item => item.part.id === partId && item.type === type);
  };

  const orderList = selectedItems.filter(item => item.type === 'order');
  const damagedList = selectedItems.filter(item => item.type === 'damaged');

  const exportToPDF = () => {
    const doc = new jsPDF();
    const title = activeTab === 'order' ? t('orderList') : t('damagedReport');
    const items = activeTab === 'order' ? orderList : damagedList;

    if (items.length === 0) return;

    // Header
    doc.setFontSize(20);
    doc.setTextColor(242, 125, 38); // Landcros Orange
    doc.text(title, 14, 22);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`${t('date')}: ${new Date().toLocaleDateString()}`, 14, 30);
    doc.text(`${t('totalItems')}: ${items.length}`, 14, 35);
    doc.text(`${t('platform')}: LANDCROS Connect Insight`, 14, 40);

    // Table
    const tableData = items.map(({ part, photo }) => [
      part.partNumber,
      part.description,
      part.sheet,
      part.itemNumber,
      photo ? t('withPhoto') : t('noPhoto')
    ]);

    autoTable(doc, {
      startY: 50,
      head: [[t('partNumber'), t('description'), t('diagram'), t('item'), t('status')]],
      body: tableData,
      headStyles: { fillColor: [242, 125, 38] },
      theme: 'grid',
    });

    // Add Photos Section if it's a damage report and has photos
    if (activeTab === 'damaged' && items.some(i => i.photo)) {
      doc.addPage();
      doc.setFontSize(18);
      doc.setTextColor(242, 125, 38);
      doc.text(t('evidence'), 14, 22);
      
      let currentY = 35;
      
      items.forEach((item, index) => {
        if (item.photo) {
          // Check if we need a new page (image height is approx 100)
          if (currentY > 180) {
            doc.addPage();
            currentY = 20;
          }
          
          doc.setFontSize(11);
          doc.setTextColor(0);
          doc.setFont('helvetica', 'bold');
          doc.text(`Item ${item.part.itemNumber}: ${item.part.partNumber}`, 14, currentY);
          doc.setFont('helvetica', 'normal');
          doc.text(`${t('description')}: ${item.part.description}`, 14, currentY + 5);
          
          try {
            // Add image with a small border/frame feel
            doc.addImage(item.photo, 'JPEG', 14, currentY + 10, 180, 100);
            currentY += 125;
          } catch (e) {
            doc.setTextColor(255, 0, 0);
            doc.text(`[${t('errorImage')}]`, 14, currentY + 15);
            currentY += 30;
          }
        }
      });
    }

    doc.save(`${title.toLowerCase().replace(/\s+/g, '_')}_${new Date().getTime()}.pdf`);
  };

  const exportTechnicalReportPDF = async () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const orange = [242, 125, 38];
    const red = [239, 68, 68];
    const yellow = [234, 179, 8];
    const green = [34, 197, 94];
    const grey = [107, 114, 128];
    const borderGray = [180, 180, 180];

    // Helper for Header
    const addHeader = (sectionTitle: string) => {
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, pageWidth, 40, 'F');

      // Orange Logo Box
      doc.setFillColor(orange[0], orange[1], orange[2]);
      doc.rect(15, 10, 55, 12, 'F');
      doc.setFontSize(14);
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.text('LANDCROSS', 42.5, 18.5, { align: 'center' });

      // Page Type Title
      doc.setFontSize(12);
      doc.setTextColor(100, 100, 100);
      doc.setFont('helvetica', 'bold');
      doc.text(sectionTitle.toUpperCase(), pageWidth - 15, 18, { align: 'right' });

      // Orange Line
      doc.setDrawColor(orange[0], orange[1], orange[2]);
      doc.setLineWidth(1);
      doc.line(15, 30, pageWidth - 15, 30);
    };

    // Helper to get image data (async)
    const getImageData = async (url: string): Promise<string | null> => {
      try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const blob = await response.blob();
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
      } catch (e) {
        return null;
      }
    };

    // Prepare catalog images
    const allSheets = allGroups.flatMap(g => g.sheets);
    const catalogImagesMap: Record<string, string | null> = {};
    
    // We only need images for selected items
    const categoriesToFetch = Array.from(new Set(selectedItems.map(i => i.part.category)));
    for (const cat of categoriesToFetch) {
      if (diagramImages[cat]) {
        catalogImagesMap[cat] = diagramImages[cat];
      } else {
        const sheet = allSheets.find(s => s.name === cat);
        if (sheet?.photo) {
          const data = await getImageData(`/${sheet.photo}`);
          catalogImagesMap[cat] = data;
        }
      }
    }

    // Page 1: Technical Report Info
    addHeader(t('inspection'));
    doc.setFontSize(32);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text(t('technicalReport'), 15, 55);

    // Info Container
    doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
    doc.setLineWidth(1.2);
    doc.roundedRect(15, 65, pageWidth - 30, 135, 8, 8, 'S');
    doc.setLineWidth(0.2); // Reset

    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text(t('inspectionInformation'), 25, 78);

    const infoFields = [
      [`${t('model')}:`, inspectionInfo.model],
      [`${t('sn')}:`, inspectionInfo.sn],
      [`${t('tag')}:`, inspectionInfo.tag],
      [`${t('delivery')}:`, inspectionInfo.delivery],
      [`${t('customer')}:`, inspectionInfo.customer],
      [`${t('description')}:`, inspectionInfo.description],
      [`${t('machineDown')}:`, inspectionInfo.machineDown ? t('yes') : t('no')]
    ];

    let currentY = 92;
    doc.setFontSize(10);
    infoFields.forEach(([label, value]) => {
      doc.setFont('helvetica', 'bold');
      doc.text(label, 25, currentY);
      doc.setFont('helvetica', 'normal');
      doc.text(String(value).toUpperCase(), 75, currentY);
      currentY += 8;
    });

    doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
    doc.setLineWidth(0.3);
    doc.line(25, currentY + 4, pageWidth - 25, currentY + 4);
    doc.setLineWidth(0.2); // Reset

    currentY += 15;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(orange[0], orange[1], orange[2]);
    doc.text(t('reportData'), 25, currentY);
    
    currentY += 10;
    doc.setTextColor(0, 0, 0);
    const reportDataFields = [
      [`${t('inspectionDate')}:`, inspectionInfo.date],
      [`${t('inspectorName')}:`, inspectionInfo.inspectorName.toUpperCase()],
      [`${t('hourMeter')}:`, inspectionInfo.hourMeter]
    ];

    reportDataFields.forEach(([label, value]) => {
      doc.setFont('helvetica', 'bold');
      doc.text(label, 25, currentY);
      doc.setFont('helvetica', 'normal');
      doc.text(String(value), 75, currentY);
      currentY += 8;
    });

    // Pages for Photos
    const itemsToExport = selectedItems.filter(i => i.photo || i.type === 'damaged');
    
    itemsToExport.forEach((item, index) => {
      doc.addPage('a4', 'l');
      addHeader(t('photo').toUpperCase() + 'S');

      doc.setFontSize(12);
      doc.setTextColor(100, 100, 100);
      doc.text(`${t('photo').toUpperCase()} ${index + 1}`, pageWidth - 15, 38, { align: 'right' });

      // Criticality Banner
      let bannerColor = green;
      let criticalityText = '!';
      let criticalityLabel = t('lowCriticality');
      
      if (item.criticality === 'A') {
        bannerColor = red;
        criticalityText = '!!!';
        criticalityLabel = t('highCriticality');
      } else if (item.criticality === 'B') {
        bannerColor = yellow;
        criticalityText = '!!';
        criticalityLabel = t('mediumCriticality');
      }

      doc.setFillColor(bannerColor[0], bannerColor[1], bannerColor[2]);
      doc.rect(15, 45, pageWidth / 2 - 20, 12, 'F');

      // Draw triangle warning icon (Improved)
      const centerX = 21;
      const centerY = 51;
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.8);
      
      // Outer Triangle
      doc.line(centerX, centerY - 4.5, centerX - 5, centerY + 3.5);
      doc.line(centerX - 5, centerY + 3.5, centerX + 5, centerY + 3.5);
      doc.line(centerX + 5, centerY + 3.5, centerX, centerY - 4.5);
      
      // Inner Exclamation/Dot
      doc.setLineWidth(1);
      doc.line(centerX, centerY - 2, centerX, centerY + 1);
      doc.setFillColor(255, 255, 255);
      doc.circle(centerX, centerY + 2.5, 0.4, 'F');

      doc.setFontSize(11);
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.text(criticalityLabel, 30, 53.5);

      // Left Image: Inspection
      if (item.photo) {
        try {
          doc.addImage(item.photo, 'JPEG', 15, 57, pageWidth / 2 - 20, 105);
        } catch (e) {
          doc.rect(15, 57, pageWidth / 2 - 20, 105);
          doc.setTextColor(150);
          doc.text('IMAGE FORMAT ERROR', 35, 110);
        }
      } else {
        doc.setDrawColor(200);
        doc.rect(15, 57, pageWidth / 2 - 20, 105);
        doc.setTextColor(150);
        doc.text('NO INSPECTION PHOTO', 35, 110);
      }

      // Bottom Info Banner (Left)
      doc.setFillColor(orange[0], orange[1], orange[2]);
      doc.rect(15, 162, pageWidth / 2 - 20, 15, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      doc.text(`${item.part.description} | PART NUMBER: ${item.part.partNumber} | QTY: ${item.quantity || 1}`, 20, 171);

      // Right Side: Parts Catalog Reference
      const catalogImgData = catalogImagesMap[item.part.category];
      if (catalogImgData) {
        try {
          doc.addImage(catalogImgData, 'PNG', pageWidth / 2 + 5, 45, pageWidth / 2 - 20, 117);
        } catch (e) {
          doc.setDrawColor(200);
          doc.rect(pageWidth / 2 + 5, 45, pageWidth / 2 - 20, 117);
          doc.setTextColor(150);
          doc.text('CATALOG IMAGE ERROR', pageWidth / 2 + 30, 100);
        }
      } else {
        doc.setDrawColor(200);
        doc.rect(pageWidth / 2 + 5, 45, pageWidth / 2 - 20, 117);
        doc.setTextColor(150);
        doc.text('NO CATALOG REFERENCE', pageWidth / 2 + 30, 100);
      }

      // Bottom Info Banner (Right)
      doc.setFillColor(orange[0], orange[1], orange[2]);
      doc.rect(pageWidth / 2 + 5, 162, pageWidth / 2 - 20, 15, 'F');
      doc.setTextColor(255, 255, 255);
      doc.text(t('partsCatalogReference'), pageWidth / 2 + 10, 171);
    });

    // Page: Parts Table
    doc.addPage('a4', 'l');
    addHeader(t('partsList'));
    doc.setFontSize(32);
    doc.setTextColor(0, 0, 0);
    doc.text(t('technicalReport'), 15, 55);
    doc.setFontSize(18);
    doc.text(t('partsList'), 25, 70);

    const tableData = selectedItems.map((item) => [
      item.part.itemNumber,
      item.part.description.toUpperCase(),
      item.part.partNumber,
      item.quantity || 1,
      `PHOTO ${itemsToExport.findIndex(i => i.timestamp === item.timestamp) + 1 || '-'}`
    ]);

    autoTable(doc, {
      startY: 80,
      margin: { left: 15, right: 15 },
      head: [[t('item'), t('partName'), t('partNumber'), t('qty'), t('associatedPhoto')]],
      body: tableData,
      headStyles: { fillColor: [0, 0, 0], textColor: [255, 255, 255], fontSize: 9 },
      bodyStyles: { fontSize: 8, textColor: [50, 50, 50] },
      theme: 'grid',
    });

    // Page: Conclusion
    doc.addPage('a4', 'l');
    addHeader(t('conclusion'));
    doc.setFontSize(32);
    doc.setTextColor(0, 0, 0);
    doc.text(`TECHNICAL REPORT LANDCROSS`, 15, 55);
    doc.setFontSize(18);
    doc.text(t('conclusion'), 25, 70);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    const conclusionLines = doc.splitTextToSize(inspectionInfo.conclusion || t('noConclusion'), pageWidth - 40);
    doc.text(conclusionLines, 25, 85);

    // Final Page
    doc.addPage('a4', 'l');
    // LANDCROSS logo in center
    doc.setFillColor(orange[0], orange[1], orange[2]);
    doc.rect(pageWidth / 2 - 50, pageHeight / 2 - 30, 100, 25, 'F');
    doc.setFontSize(36);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text('LANDCROSS', pageWidth / 2, pageHeight / 2 - 13, { align: 'center' });

    doc.setFontSize(18);
    doc.setTextColor(orange[0], orange[1], orange[2]);
    doc.text(t('safeMessage1'), pageWidth / 2, pageHeight / 2 + 20, { align: 'center' });
    
    doc.setFontSize(12);
    doc.text(t('safeMessage2'), pageWidth / 2, pageHeight / 2 + 40, { align: 'center' });

    doc.setFontSize(16);
    doc.text(t('end'), pageWidth / 2, pageHeight / 2 + 65, { align: 'center' });

    doc.save(`technical_report_${inspectionInfo.sn}_${new Date().getTime()}.pdf`);
  };

  const diagramContainerRef = React.useRef<HTMLDivElement>(null);

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-zinc-100 font-sans selection:bg-landcros/30 bg-mining overflow-hidden">
      <input 
        type="file" 
        ref={annotationFileRef} 
        className="hidden" 
        accept="image/*" 
        onChange={handleAnnotationPhotoUpload} 
      />
      {/* Sidebar / Navigation */}
      <motion.div 
        initial={false}
        animate={{ x: isSidebarCollapsed ? -80 : 0 }}
        className="fixed left-0 top-0 bottom-0 w-16 md:w-20 bg-[#141414]/90 backdrop-blur-xl border-r border-white/5 flex flex-col items-center py-4 gap-4 z-50"
      >
        <div className="flex flex-col items-center gap-1.5 mb-2">
          <div className="w-10 h-10 bg-white rounded-lg flex flex-col items-center justify-center p-1 shadow-[0_0_15px_rgba(242,125,38,0.2)] overflow-hidden">
            <span className="text-[7px] font-black text-red-600 tracking-tighter leading-none">HITACHI</span>
            <div className="w-full h-[1px] bg-red-600/20 my-0.5" />
            <span className="text-[5px] font-bold text-zinc-400 uppercase tracking-widest">{t('original')}</span>
          </div>
          <span className="text-[8px] font-black text-landcros tracking-tighter uppercase">Landcros</span>
        </div>
        
        <nav className="flex flex-col gap-2 overflow-y-auto max-h-[80vh] no-scrollbar">
          <button 
            onClick={() => setActiveTab('report')}
            className={`p-2.5 rounded-lg transition-all relative ${activeTab === 'report' ? 'bg-landcros/20 text-landcros' : 'text-zinc-500 hover:text-zinc-300'}`}
            title={t('report')}
          >
            <ClipboardList size={20} />
          </button>
          <button 
            onClick={() => setActiveTab('inspect')}
            className={`p-2.5 rounded-lg transition-all ${activeTab === 'inspect' ? 'bg-landcros/20 text-landcros' : 'text-zinc-500 hover:text-zinc-300'}`}
            title={t('inspect')}
          >
            <MapIcon size={20} />
          </button>
          <button 
            onClick={() => setActiveTab('order')}
            className={`p-2.5 rounded-lg transition-all relative ${activeTab === 'order' ? 'bg-landcros/20 text-landcros' : 'text-zinc-500 hover:text-zinc-300'}`}
            title={t('order')}
          >
            <ShoppingCart size={20} />
            {orderList.length > 0 && <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-landcros rounded-full shadow-[0_0_8px_rgba(242,125,38,0.5)]" />}
          </button>
          <button 
            onClick={() => setActiveTab('damaged')}
            className={`p-2.5 rounded-lg transition-all relative ${activeTab === 'damaged' ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
            title={t('damaged')}
          >
            <AlertTriangle size={20} />
            {damagedList.length > 0 && <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-red-500 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.5)]" />}
          </button>

          <div className="w-8 h-[1px] bg-white/10 my-0.5 self-center" />

          <button 
            onClick={() => setShowNewProjectModal(true)}
            className="p-2.5 rounded-lg text-zinc-500 hover:text-landcros hover:bg-landcros/10 transition-all group"
            title={t('newInspectionTooltip')}
          >
            <FilePlus size={20} className="group-hover:scale-110 transition-transform" />
          </button>

          {isAdmin && (
            <div className="flex flex-col gap-2">
              <div className="w-8 h-[1px] bg-white/10 my-1 self-center" />
              
              <button 
                onClick={() => setActiveTab('projects')}
                className={`p-2.5 rounded-lg transition-all ${activeTab === 'projects' ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                title={t('projects')}
              >
                <Settings size={20} />
              </button>
              
              <button 
                onClick={() => setIsEditMode(!isEditMode)}
                className={`p-2.5 rounded-lg transition-all ${isEditMode ? 'bg-landcros text-white shadow-[0_0_12px_rgba(242,125,38,0.4)]' : 'text-zinc-500 hover:text-zinc-300 bg-white/5'}`}
                title={isEditMode ? t('viewModeTooltip') : t('editModeTooltip')}
              >
                {isEditMode ? <Wrench size={20} /> : <Eye size={20} />}
              </button>
            </div>
          )}
        </nav>

        <div className="mt-auto flex flex-col gap-2 pb-2">
          <button 
            onClick={() => {
              const next = language === 'pt' ? 'en' : 'pt';
              setLanguage(next);
              localStorage.setItem('language', next);
            }}
            className="p-2.5 rounded-lg transition-all flex items-center justify-center bg-white/5 text-zinc-500 hover:text-white"
            title={language === 'pt' ? t('switchToEnglish') : t('switchToPortuguese')}
          >
            <span className="text-[10px] font-black uppercase text-landcros">{language === 'pt' ? 'en' : 'pt'}</span>
          </button>
          
          <button 
            onClick={() => setIsDetailsVisible(!isDetailsVisible)}
            className={`p-2.5 rounded-lg transition-all flex items-center justify-center ${isDetailsVisible ? 'bg-white/5 text-zinc-500' : 'bg-landcros/20 text-landcros'}`}
            title={isDetailsVisible ? t('hideDetailsTooltip') : t('showDetailsTooltip')}
          >
            {isDetailsVisible ? <List size={20} /> : <Maximize2 size={20} />}
          </button>
          
          <button 
            onClick={toggleAdmin}
            className={`p-2.5 rounded-lg transition-all flex items-center justify-center ${isAdmin ? 'bg-green-500/20 text-green-500' : 'bg-white/5 text-zinc-600 hover:text-zinc-400'}`}
            title={isAdmin ? "Bloquear Configurações" : "Liberar Modo Desenvolvedor"}
          >
            {isAdmin ? <ShieldCheck size={20} /> : <Shield size={20} />}
          </button>
          <div className="px-1 text-center">
            <p className="text-[5px] text-zinc-600 uppercase font-bold leading-tight">Backup Local.</p>
          </div>
          {isAdmin && (
            <button 
              onClick={() => {
                if (confirm('Deseja limpar todos os dados salvos? Isso removerá imagens e configurações.')) {
                  localStorage.clear();
                  window.location.reload();
                }
              }}
              className="p-2 text-zinc-600 hover:text-red-500 transition-colors mt-2"
              title="Limpar Tudo"
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>
      </motion.div>

      <main className={`flex-1 h-screen flex flex-col transition-all duration-300 ${isSidebarCollapsed ? 'pl-0' : 'pl-16 md:pl-20'}`}>
        {/* New Project Confirmation Modal */}
        <AnimatePresence>
          {showNewProjectModal && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="bg-[#141414] border border-white/10 p-8 rounded-3xl shadow-2xl max-w-sm w-full space-y-6"
              >
                <div className="text-center space-y-2">
                  <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <FilePlus size={32} className="text-red-500" />
                  </div>
                  <h3 className="text-xl font-bold text-white uppercase italic tracking-tighter">{t('newInspection')}</h3>
                  <p className="text-zinc-500 text-xs">{t('newInspectionDesc')}</p>
                </div>

                <div className="flex flex-col gap-3">
                  <button 
                    onClick={startNewProject}
                    className="w-full py-4 rounded-xl bg-red-500 text-white font-bold uppercase text-[10px] tracking-widest hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
                  >
                    {t('confirmStart')}
                  </button>
                  <button 
                    onClick={() => setShowNewProjectModal(false)}
                    className="w-full py-4 rounded-xl bg-white/5 text-zinc-400 font-bold uppercase text-[10px] tracking-widest hover:bg-white/10 transition-all"
                  >
                    {t('cancel')}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* PIN Modal */}
        <AnimatePresence>
          {showPinModal && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="bg-[#141414] border border-white/10 p-8 rounded-3xl shadow-2xl max-w-sm w-full space-y-6"
              >
                <div className="text-center space-y-2">
                  <div className="w-16 h-16 bg-landcros/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Shield size={32} className="text-landcros" />
                  </div>
                  <h3 className="text-xl font-bold text-white uppercase italic tracking-tighter">{t('restrictedAccess')}</h3>
                  <p className="text-zinc-500 text-xs">{t('restrictedAccessDesc')}</p>
                </div>

                <form onSubmit={handlePinSubmit} className="space-y-4">
                  <input 
                    autoFocus
                    type="password"
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-center text-2xl font-mono tracking-[0.5em] text-landcros outline-none focus:border-landcros transition-all"
                    placeholder="••••"
                  />
                  <div className="flex gap-3">
                    <button 
                      type="button"
                      onClick={() => setShowPinModal(false)}
                      className="flex-1 py-3 rounded-xl bg-white/5 text-zinc-400 font-bold uppercase text-[10px] tracking-widest hover:bg-white/10 transition-all"
                    >
                      {t('cancel')}
                    </button>
                    <button 
                      type="submit"
                      className="flex-1 py-3 rounded-xl bg-landcros text-white font-bold uppercase text-[10px] tracking-widest hover:bg-orange-400 transition-all shadow-lg shadow-landcros/20"
                    >
                      {t('enter')}
                    </button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Link Modal */}
        <AnimatePresence>
          {showLinkModal && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="bg-[#141414] border border-white/10 rounded-3xl p-8 max-w-md w-full shadow-2xl"
              >
                <div className="mb-6">
                  <h3 className="text-xl font-black text-white uppercase italic tracking-tighter">{t('linkImage')}</h3>
                  <p className="text-zinc-500 text-xs mt-1">{t('linkImageDesc')} <span className="text-landcros font-bold">"{showLinkModal.from}"</span>.</p>
                </div>

                <div className="max-h-[300px] overflow-y-auto custom-scrollbar space-y-2 mb-6 pr-2">
                  {allGroups.flatMap(g => g.sheets).map(sheet => (
                    <button
                      key={sheet.name}
                      onClick={() => handleLinkCategory(sheet.name)}
                      className="w-full text-left p-3 rounded-xl bg-white/5 hover:bg-landcros/20 hover:text-landcros transition-all border border-white/5 flex items-center justify-between group"
                    >
                      <span className="text-xs font-bold uppercase tracking-tight">{sheet.name}</span>
                      <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ))}
                </div>

                <button 
                  onClick={() => setShowLinkModal(null)}
                  className="w-full py-3 rounded-xl bg-white/5 text-zinc-400 font-bold uppercase text-[10px] tracking-widest hover:bg-white/10 transition-all"
                >
                  {t('cancel')}
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {activeTab === 'report' && (
          <div className="flex-1 p-8 overflow-y-auto bg-mining">
            <div className="max-w-4xl mx-auto space-y-8">
              <header className="flex justify-between items-end">
                <div>
                  <span className="text-[9px] font-mono text-landcros font-bold uppercase tracking-widest">{t('technicalReport')}</span>
                  <h2 className="text-4xl font-black tracking-tighter text-white mt-1 uppercase italic">{language === 'pt' ? 'Informações da Máquina' : 'Machine Information'}</h2>
                </div>
                <button 
                  onClick={exportTechnicalReportPDF}
                  className="flex items-center gap-2 bg-landcros hover:bg-orange-400 text-white px-8 py-4 rounded-2xl font-black uppercase text-xs tracking-widest transition-all shadow-2xl shadow-landcros/20"
                >
                  <Download size={18} />
                  {language === 'pt' ? 'Gerar Relatório PDF' : 'Generate PDF Report'}
                </button>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-[#141414]/90 backdrop-blur-xl border border-white/5 p-8 rounded-3xl space-y-6">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Info size={20} className="text-landcros" />
                    {language === 'pt' ? 'Dados da Máquina' : 'Machine Data'}
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2 col-span-2">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{language === 'pt' ? 'Selecionar Máquina' : 'Select Machine'}</label>
                      <select 
                        value={inspectionInfo.tag}
                        onChange={(e) => handleMachineChange(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:border-landcros outline-none transition-all appearance-none cursor-pointer"
                      >
                        <option value="" className="bg-[#141414]">{language === 'pt' ? 'Selecione uma máquina...' : 'Select a machine...'}</option>
                        {MACHINE_DATABASE.map(m => (
                          <option key={m.tag} value={m.tag} className="bg-[#141414]">
                            {m.tag}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">TAG</label>
                      <input 
                        type="text" 
                        value={inspectionInfo.tag}
                        onChange={(e) => setInspectionInfo(prev => ({ ...prev, tag: e.target.value }))}
                        className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:border-landcros outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{t('model')}</label>
                      <input 
                        type="text" 
                        value={inspectionInfo.model}
                        onChange={(e) => setInspectionInfo(prev => ({ ...prev, model: e.target.value }))}
                        className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:border-landcros outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{t('sn')}</label>
                      <input 
                        type="text" 
                        value={inspectionInfo.sn}
                        onChange={(e) => setInspectionInfo(prev => ({ ...prev, sn: e.target.value }))}
                        className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:border-landcros outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{t('delivery')}</label>
                      <input 
                        type="text" 
                        value={inspectionInfo.delivery}
                        onChange={(e) => setInspectionInfo(prev => ({ ...prev, delivery: e.target.value }))}
                        className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:border-landcros outline-none transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{t('customer')}</label>
                    <input 
                      type="text" 
                      value={inspectionInfo.customer}
                      onChange={(e) => setInspectionInfo(prev => ({ ...prev, customer: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:border-landcros outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{t('description')}</label>
                    <input 
                      type="text" 
                      value={inspectionInfo.description}
                      onChange={(e) => setInspectionInfo(prev => ({ ...prev, description: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:border-landcros outline-none transition-all"
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                    <span className="text-xs font-bold text-zinc-300">{t('machineDown')}</span>
                    <button 
                      onClick={() => setInspectionInfo(prev => ({ ...prev, machineDown: !prev.machineDown }))}
                      className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                        inspectionInfo.machineDown ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 'bg-white/10 text-zinc-500'
                      }`}
                    >
                      {inspectionInfo.machineDown ? t('yes') : t('no')}
                    </button>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="bg-[#141414]/90 backdrop-blur-xl border border-white/5 p-8 rounded-3xl space-y-6">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <ShieldCheck size={20} className="text-landcros" />
                      {t('inspectorData')}
                    </h3>
                    
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{t('inspectorName')}</label>
                      <input 
                        type="text" 
                        value={inspectionInfo.inspectorName}
                        onChange={(e) => setInspectionInfo(prev => ({ ...prev, inspectorName: e.target.value }))}
                        className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:border-landcros outline-none transition-all"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{t('hourMeter')}</label>
                        <input 
                          type="text" 
                          value={inspectionInfo.hourMeter}
                          onChange={(e) => setInspectionInfo(prev => ({ ...prev, hourMeter: e.target.value }))}
                          className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:border-landcros outline-none transition-all"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{language === 'pt' ? 'Data' : 'Date'}</label>
                        <input 
                          type="date" 
                          value={inspectionInfo.date}
                          onChange={(e) => setInspectionInfo(prev => ({ ...prev, date: e.target.value }))}
                          className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:border-landcros outline-none transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#141414]/90 backdrop-blur-xl border border-white/5 p-8 rounded-3xl space-y-4">
                    <h3 className="text-lg font-bold text-white">{t('reportConclusion')}</h3>
                    <textarea 
                      value={inspectionInfo.conclusion}
                      onChange={(e) => setInspectionInfo(prev => ({ ...prev, conclusion: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white text-sm focus:border-landcros outline-none transition-all min-h-[150px] resize-none"
                      placeholder={t('reportConclusionPlaceholder')}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'projects' && (
          <div className="flex-1 p-8 overflow-y-auto bg-mining">
            <div className="max-w-2xl mx-auto space-y-8">
              <header>
                <span className="text-[9px] font-mono text-landcros font-bold uppercase tracking-widest">Gerenciador de Inspeções</span>
                <h2 className="text-4xl font-black tracking-tighter text-white mt-1 uppercase italic">Backup & Projetos</h2>
              </header>

              <div className="grid gap-6">
                {/* Current Project Info */}
                <div className="bg-[#141414]/90 backdrop-blur-xl border border-white/5 p-6 rounded-2xl space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 block">Nome da Inspeção Atual</label>
                    <input 
                      type="text" 
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white font-bold focus:border-landcros outline-none transition-all"
                      placeholder="Ex: Escavadeira ZX210 - Cliente X"
                    />
                  </div>
                  
                  <div className="flex flex-wrap gap-3">
                    <button 
                      onClick={exportProject}
                      className="flex-1 flex items-center justify-center gap-2 bg-landcros hover:bg-landcros/80 text-white p-4 rounded-xl font-bold transition-all shadow-lg shadow-landcros/20"
                    >
                      <Save size={18} />
                      Baixar Backup (.landcros)
                    </button>
                    <label className="flex-1 flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-white p-4 rounded-xl font-bold transition-all border border-white/10 cursor-pointer">
                      <Upload size={18} />
                      Importar Backup
                      <input type="file" accept=".landcros" onChange={importProject} className="hidden" />
                    </label>
                  </div>
                </div>

                <div className="bg-[#141414]/90 backdrop-blur-xl border border-white/5 p-6 rounded-2xl">
                  <h3 className="text-lg font-bold text-white mb-2">Configurações de Acesso</h3>
                  <p className="text-zinc-500 text-xs mb-4">Altere a senha de desenvolvedor para proteger suas configurações.</p>
                  <div className="flex gap-3">
                    <input 
                      type="password" 
                      value={adminPin}
                      onChange={(e) => setAdminPin(e.target.value)}
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl p-3 text-white font-mono focus:border-landcros outline-none transition-all"
                      placeholder="Nova Senha"
                    />
                    <button 
                      onClick={() => alert('Senha salva com sucesso!')}
                      className="bg-white/5 hover:bg-white/10 text-white px-6 rounded-xl font-bold border border-white/10 transition-all"
                    >
                      Salvar
                    </button>
                  </div>
                </div>

                <div className="bg-[#141414]/90 backdrop-blur-xl border border-white/5 p-6 rounded-2xl">
                  <h3 className="text-lg font-bold text-white mb-2">Adicionar Novas Sheets (Fotos)</h3>
                  <p className="text-zinc-500 text-xs mb-6">Crie novas categorias para carregar mais fotos de diagramas ou manuais.</p>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Left Column: Addition Controls */}
                    <div className="space-y-6">
                      <div className="space-y-3">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block text-zinc-400">Adicionar Nova Sheet (Máquina)</label>
                        <div className="flex gap-2">
                          <input 
                            type="text" 
                            id="new-cat-input"
                            className="flex-1 bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:border-landcros outline-none transition-all text-sm"
                            placeholder="Nome da Sheet"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const val = (e.target as HTMLInputElement).value.trim();
                                if (val && !categories.includes(val)) {
                                  setCustomCategories(prev => ({
                                    ...prev,
                                    [selectedGroup]: [...(prev[selectedGroup] || []), val]
                                  }));
                                  (e.target as HTMLInputElement).value = '';
                                }
                              }
                            }}
                          />
                          <button 
                            onClick={() => {
                              const input = document.getElementById('new-cat-input') as HTMLInputElement;
                              const val = input.value.trim();
                              if (val && !categories.includes(val)) {
                                setCustomCategories(prev => ({
                                  ...prev,
                                  [selectedGroup]: [...(prev[selectedGroup] || []), val]
                                }));
                                input.value = '';
                              }
                            }}
                            className="bg-landcros text-white px-4 rounded-xl font-bold hover:bg-orange-400 transition-all"
                          >
                            <Plus size={18} />
                          </button>
                          <button className="bg-white/5 text-zinc-400 p-3 rounded-xl border border-white/10 hover:bg-white/10 transition-all">
                            <List size={18} />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block text-zinc-400">Adicionar várias fotos de uma vez</label>
                        <label className="flex items-center justify-center gap-3 bg-white/5 hover:bg-white/10 text-white p-4 rounded-xl font-bold transition-all border border-white/10 cursor-pointer text-sm">
                          <Upload size={20} />
                          Selecionar Múltiplas Fotos
                          <input type="file" multiple accept="image/*" onChange={handleBulkImageUpload} className="hidden" />
                        </label>
                        <p className="text-[10px] text-zinc-600 italic">Cada foto criará uma nova aba automaticamente.</p>
                      </div>
                    </div>

                    {/* Right Column: Sheet Management */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block text-zinc-400">Gerenciar Lista de Máquinas</label>
                          <div className="flex gap-2">
                            <button 
                              onClick={() => {
                                if (confirm('Deseja apagar TODAS as sheets customizadas deste grupo?')) {
                                  setCustomCategories(prev => ({ ...prev, [selectedGroup]: [] }));
                                }
                              }}
                              className="text-[10px] font-bold text-red-500 uppercase tracking-widest hover:underline"
                            >
                              Limpar Customizadas
                            </button>
                            <button 
                              onClick={copyGroupPhotosToSheets}
                              className="text-[10px] font-bold text-landcros uppercase tracking-widest hover:underline"
                            >
                              Auto-Vincular Fotos
                            </button>
                          </div>
                        </div>
                      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                        <div className="max-h-[200px] overflow-y-auto custom-scrollbar">
                          {categories.map(cat => (
                            <div key={cat} className="flex items-center justify-between p-3 border-b border-white/5 last:border-0 hover:bg-white/5 transition-all">
                              <span className="text-xs font-bold text-zinc-400 uppercase tracking-tight">{cat}</span>
                              <div className="flex gap-2 items-center">
                                {diagramImages[cat] && (
                                  <div className="w-2 h-2 rounded-full bg-green-500" title="Foto Carregada" />
                                )}
                                <button className="text-zinc-600 hover:text-zinc-400 transition-colors">
                                  <Settings size={14} />
                                </button>
                              </div>
                            </div>
                          ))}
                          {(customCategories[selectedGroup] || []).map(cat => (
                            <div key={cat} className="flex items-center justify-between p-3 border-b border-white/5 last:border-0 hover:bg-white/5 transition-all">
                              <span className="text-xs font-bold text-zinc-400 uppercase tracking-tight">{cat}</span>
                              <div className="flex gap-2 items-center">
                                {diagramImages[cat] && (
                                  <div className="w-2 h-2 rounded-full bg-green-500" title="Foto Carregada" />
                                )}
                                <button 
                                  onClick={() => setShowLinkModal({ from: cat })}
                                  className="text-zinc-600 hover:text-landcros transition-colors"
                                  title="Vincular a uma Sheet existente"
                                >
                                  <Layers size={14} />
                                </button>
                                <button 
                                  onClick={() => {
                                    setCustomCategories(prev => {
                                      const next = { ...prev };
                                      if (next[selectedGroup]) {
                                        next[selectedGroup] = next[selectedGroup].filter(c => c !== cat);
                                      }
                                      return next;
                                    });
                                    setDiagramImages(prev => {
                                      const next = { ...prev };
                                      delete next[cat];
                                      return next;
                                    });
                                  }}
                                  className="text-zinc-600 hover:text-red-500 transition-colors"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          ))}
                          {categories.length === 0 && (customCategories[selectedGroup] || []).length === 0 && (
                            <div className="p-8 text-center">
                              <p className="text-zinc-600 text-[10px] font-bold uppercase tracking-widest">Nenhuma sheet encontrada</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-[#141414]/90 backdrop-blur-xl border border-white/5 p-6 rounded-2xl">
                  <h3 className="text-lg font-bold text-white mb-2">Finalizar Configuração</h3>
                  <p className="text-zinc-500 text-xs mb-6">Bloqueia o Modo Desenvolvedor e volta para a tela de inspeção para uso da equipe.</p>
                  <button 
                    onClick={toggleAdmin}
                    className="w-full flex items-center justify-center gap-2 bg-green-500/10 hover:bg-green-500/20 text-green-500 p-4 rounded-xl font-bold transition-all border border-green-500/20"
                  >
                    <ShieldCheck size={18} />
                    Bloquear e Sair do Modo Desenvolvedor
                  </button>
                </div>

                {/* New Project */}
                <div className="bg-[#141414]/90 backdrop-blur-xl border border-white/5 p-6 rounded-2xl">
                  <h3 className="text-lg font-bold text-white mb-2">Iniciar Nova Inspeção</h3>
                  <p className="text-zinc-500 text-xs mb-6">Limpa todos os dados atuais e bloqueia o Modo Desenvolvedor para uma nova inspeção segura.</p>
                  <button 
                    onClick={() => setShowNewProjectModal(true)}
                    className="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-red-500/20 hover:text-red-500 text-zinc-400 p-4 rounded-xl font-bold transition-all border border-white/10"
                  >
                    <FilePlus size={18} />
                    Criar Nova Inspeção em Branco
                  </button>
                </div>

                <div className="bg-blue-500/10 border border-blue-500/20 p-6 rounded-2xl flex gap-4">
                  <Info className="text-blue-500 shrink-0" size={24} />
                  <div className="space-y-2">
                    <h4 className="text-blue-500 font-bold text-sm">Como funciona o salvamento?</h4>
                    <p className="text-zinc-400 text-xs leading-relaxed">
                      O app salva tudo automaticamente no seu navegador. Ao "Baixar Backup", você gera um arquivo que contém todas as fotos e marcações. Você pode usar esse arquivo para restaurar seu trabalho em outro computador ou para arquivar inspeções antigas.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'inspect' && (
          <>
            {/* Top Navigation: Group/Category/Sheet Selector */}
            <div className="bg-[#141414] border-b border-white/5 flex flex-col sticky top-0 z-40 bg-zinc-950/80 backdrop-blur-md">
              {/* Row 1: Groups */}
              <div className="flex items-center gap-3 px-3 py-1 border-b border-white/5">
                <div className="flex items-center gap-1.5 pr-3 border-r border-white/10 shrink-0">
                  <div className="w-5 h-5 bg-landcros/10 rounded flex items-center justify-center text-landcros">
                    <Folder size={12} />
                  </div>
                  <span className="text-[7.5px] font-black text-zinc-500 uppercase tracking-widest">Grupos</span>
                </div>
                
                <div className="flex-1 overflow-hidden relative group">
                  <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar">
                    {allGroups.map(group => (
                      <div key={group.id} className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => { 
                            setSelectedGroup(group.name); 
                            setSelectedCategory(group.sheets.length > 0 ? group.sheets[0].name : '');
                            setFocusedPart(null); 
                          }}
                          className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-[8.5px] font-bold uppercase tracking-widest transition-all ${
                            selectedGroup === group.name 
                              ? 'bg-landcros text-white shadow-[0_0_10px_rgba(242,125,38,0.2)]' 
                              : 'bg-white/5 text-zinc-500 hover:text-zinc-300'
                          }`}
                        >
                          {group.name}
                        </button>
                        {isAdmin && !CATALOG_STRUCTURE.some(g => g.name === group.name) && (
                          <div className="flex gap-1">
                            <button 
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                const newName = prompt('Renomear Grupo:', group.name);
                                if (newName) {
                                  const name = newName.toUpperCase().trim();
                                  setCustomGroups(prev => prev.map(g => g.id === group.id ? { ...g, name } : g));
                                  setSelectedGroup(name);
                                }
                              }}
                              className="p-1.5 text-zinc-600 hover:text-landcros transition-colors"
                              title="Renomear Grupo"
                            >
                              <Settings size={12}/>
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group.name); }}
                              className="p-1.5 text-zinc-600 hover:text-red-500 transition-colors"
                              title="Excluir Grupo"
                            >
                              <Trash2 size={12}/>
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                    {isAdmin && (
                      <button 
                        onClick={() => {
                          const name = prompt('Digite o nome do novo grupo:');
                          if (name) handleAddGroup(name);
                        }}
                        className="p-2 bg-white/5 text-landcros hover:bg-landcros/20 rounded-lg transition-all"
                        title="Adicionar Novo Grupo"
                      >
                        <Plus size={14}/>
                      </button>
                    )}
                  </div>
                </div>
                <div className="pl-4 border-l border-white/10 flex items-center gap-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
                    <input 
                      type="text" 
                      placeholder="BUSCA SHEET"
                      className="bg-black/40 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-[9px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-landcros/50 transition-all w-[200px] font-black uppercase tracking-widest"
                    />
                  </div>
                </div>
              </div>

              {/* Row 2: Sheets & Inspection Info */}
              <div className="flex items-center gap-3 px-3 py-1.5">
                <div className="flex items-center gap-2 pr-4 border-r border-white/10 shrink-0">
                  <div className="w-8 h-8 bg-landcros rounded-lg flex items-center justify-center text-white shadow-lg shadow-landcros/20">
                    <Package size={14} />
                  </div>
                  <div className="flex flex-col">
                    <h1 className="text-[10px] font-black uppercase tracking-tighter leading-none flex items-center gap-1">
                      CONNECT <span className="text-landcros italic">INSIGHT</span>
                    </h1>
                    <div className="flex flex-col mt-0.5">
                      <span className="text-[5.5px] font-black text-zinc-500 uppercase tracking-[0.2em] leading-none">Inspeção</span>
                      <p className="text-[7.5px] font-black text-white uppercase tracking-tight truncate max-w-[140px] leading-tight mt-0.5">
                        {projectName} <span className="text-zinc-600 font-mono text-[6.5px] ml-1">EX1200-7-BH</span>
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-hidden relative group h-12 flex items-center">
                  <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-[#0D0D0D] to-transparent z-10 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="flex gap-2 overflow-x-auto no-scrollbar items-center px-2 w-full h-full">
                    <button 
                      onClick={() => setViewMode('list')}
                      className={`whitespace-nowrap px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all shrink-0 flex items-center gap-2 ${
                        viewMode === 'list' 
                          ? 'bg-zinc-800 text-white border border-white/10 shadow-xl scale-105 z-10' 
                          : 'bg-white/5 text-zinc-500 hover:text-zinc-300 border border-transparent'
                      }`}
                    >
                      <List size={12} />
                      {language === 'pt' ? 'Lista' : 'List'}
                    </button>
                    <button 
                      onClick={() => setViewMode('bom')}
                      className={`whitespace-nowrap px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all shrink-0 flex items-center gap-2 ${
                        viewMode === 'bom' 
                          ? 'bg-zinc-800 text-white border border-white/10 shadow-xl scale-105 z-10' 
                          : 'bg-white/5 text-zinc-500 hover:text-zinc-300 border border-transparent'
                      }`}
                    >
                      <ClipboardList size={12} />
                      BOM
                    </button>
                    <div className="w-[1px] h-5 bg-white/10 mx-2 shrink-0" />
                    <div className="flex gap-2 items-center">
                      {categories.map(cat => (
                        <button
                          key={cat}
                          onClick={() => { 
                            setSelectedCategory(cat); 
                            setFocusedPart(null); 
                            setViewMode('visual');
                          }}
                          className={`whitespace-nowrap px-5 py-2.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all shrink-0 relative ${
                            selectedCategory === cat && viewMode === 'visual'
                              ? 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.15)] ring-2 ring-white/20 scale-105 z-10' 
                              : 'bg-white/5 text-zinc-500 hover:text-white border border-transparent hover:bg-white/10'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                      {(customCategories[selectedGroup] || []).map(cat => (
                        <button
                          key={cat}
                          onClick={() => { 
                            setSelectedCategory(cat); 
                            setFocusedPart(null); 
                            setViewMode('visual');
                          }}
                          className={`whitespace-nowrap px-5 py-2.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all shrink-0 relative ${
                            selectedCategory === cat && viewMode === 'visual'
                              ? 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.15)] ring-2 ring-white/20 scale-105 z-10' 
                              : 'bg-white/5 text-zinc-500 hover:text-white border border-transparent hover:bg-white/10'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                    {isAdmin && (
                      <button 
                        onClick={() => {
                          const name = prompt(t('newSheetPrompt'));
                          if (name) {
                            const newSheet = name.toUpperCase().trim();
                            setCustomCategories(prev => ({
                              ...prev,
                              [selectedGroup]: [...(prev[selectedGroup] || []), newSheet]
                            }));
                            setSelectedCategory(newSheet);
                            setViewMode('visual');
                          }
                        }}
                        className="p-2 bg-white/5 text-zinc-500 hover:text-landcros rounded-lg transition-all shrink-0 flex items-center justify-center min-w-[36px]"
                        title={t('addSheet')}
                      >
                        <Plus size={16}/>
                      </button>
                    )}
                  </div>
                  <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[#0D0D0D] to-transparent z-10 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            </div>

            <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
              {/* Left Side: Visual Diagram Area */}
              <div className="flex-1 bg-white relative overflow-hidden flex flex-col">
                  {viewMode === 'visual' && (
                    <div className="flex-1 flex flex-col overflow-hidden">
                      {/* Diagram Annotation Tools (Static Header Bar) */}
                      <AnimatePresence>
                        {isDiagramToolbarVisible && isAdmin && (
                          <motion.div 
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="bg-zinc-50/80 backdrop-blur-md border-b border-zinc-200 px-6 py-2 flex items-center justify-between z-[60] shrink-0 overflow-hidden shadow-sm"
                          >
                            <div className="flex items-center gap-6">
                              <div className="bg-[#00D154] text-white text-[8px] font-black uppercase tracking-tighter px-2 py-1 rounded shadow-sm">
                                MASTER
                              </div>
                              <div className="flex items-center gap-2 pr-6 border-r border-zinc-200 ml-[-8px]">
                                {['#000000', '#f27d26', '#ef4444', '#22c55e'].map(c => (
                                  <button
                                    key={c}
                                    onClick={() => setActiveColor(c)}
                                    className={`w-6 h-6 rounded-full border-2 transition-all ${activeColor === c ? 'border-zinc-800 scale-110 shadow-md' : 'border-transparent opacity-60'}`}
                                    style={{ backgroundColor: c }}
                                  />
                                ))}
                              </div>
                              <div className="flex items-center gap-1">
                                {[
                                  { id: 'none', icon: MousePointer2, label: 'Mouse' },
                                  { id: 'circle', icon: Target, label: 'Círculo' },
                                  { id: 'arrow', icon: Navigation, label: 'Seta' },
                                  { id: 'box', icon: Square, label: 'Box' },
                                  { id: 'text', icon: Type, label: 'Texto' },
                                  { id: 'photo', icon: ImageIcon, label: 'Foto' },
                                  { id: 'eraser', icon: Eraser, label: 'Borracha' }
                                ].map(tool => (
                                  <button
                                    key={tool.id}
                                    onClick={() => setActiveTool(tool.id as AnnotationType)}
                                    className={`px-3 py-2 rounded-lg flex items-center gap-2 transition-all ${
                                      activeTool === tool.id 
                                        ? 'bg-landcros text-white shadow-md' 
                                        : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100'
                                    }`}
                                  >
                                    <tool.icon size={14} className={tool.id === 'arrow' ? 'rotate-45' : ''} />
                                    <span className="text-[10px] font-black uppercase tracking-tight">{tool.label}</span>
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <p className={`text-[9px] font-bold uppercase tracking-widest ${saveStatus === 'error' ? 'text-red-500' : 'text-zinc-400'}`}>
                                {saveStatus === 'saving' ? 'Salvando...' : saveStatus === 'error' ? 'Erro de Armazenamento' : 'Sincronizado'}
                              </p>
                              <div className={`w-2 h-2 rounded-full ${saveStatus === 'saving' ? 'bg-amber-400 animate-pulse' : saveStatus === 'error' ? 'bg-red-500' : 'bg-green-500 animate-pulse duration-[3000ms]'}`} />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <div className="flex-1 relative flex flex-col overflow-hidden">
                        {/* Top Labels */}
                        <div className="absolute top-6 left-6 z-20 pointer-events-none">
                          <div className="flex items-center gap-3">
                            <h2 className="text-2xl font-black tracking-tighter text-black uppercase italic">
                              {selectedCategory}
                            </h2>
                            <div className="flex gap-2 pointer-events-auto">
                               {isAdmin && (
                                 <button 
                                   onClick={() => setIsDiagramToolbarVisible(!isDiagramToolbarVisible)}
                                   className={`p-2 rounded-lg transition-all flex items-center gap-2 ${isDiagramToolbarVisible ? 'bg-zinc-800 text-white' : 'bg-landcros text-white shadow-lg shadow-landcros/20'}`}
                                 >
                                   <Wrench size={14}/>
                                   <span className="text-[10px] font-bold uppercase">{isDiagramToolbarVisible ? 'Esconder' : 'Ferramentas'}</span>
                                 </button>
                               )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest font-bold">Diagrama Técnico</p>
                            <div className="w-1 h-1 rounded-full bg-zinc-300" />
                            <span className="text-[8px] bg-red-100 text-red-500 px-2 py-0.5 rounded-full font-black uppercase tracking-tight">Oculto para usuário</span>
                          </div>
                        </div>

                        {/* Diagram Container */}
                        <div 
                          ref={diagramContainerRef}
                          onWheel={handleWheel}
                          onMouseDown={handleMouseDown}
                          onMouseMove={handleMouseMove}
                          onMouseUp={handleMouseUp}
                          onMouseLeave={handleMouseUp}
                          className={`flex-1 relative flex items-center justify-center overflow-hidden bg-white ${isPanning ? 'cursor-grabbing' : currentConfig.scale > 1 ? 'cursor-grab' : activeTool !== 'none' ? 'cursor-crosshair' : ''}`}
                        >
                          {/* Floating Annotation Settings Floater (Diagram) */}
                        <AnimatePresence>
                          {highlightState.activeAnnId && diagramAnnotations[selectedCategory]?.find(a => a.id === highlightState.activeAnnId) && (
                            <motion.div 
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: 20 }}
                              className="absolute right-6 bottom-24 w-56 bg-white border border-zinc-200 rounded-[28px] p-5 shadow-2xl z-50 space-y-4"
                            >
                              <div className="flex items-center justify-between border-b border-zinc-50 pb-3 mb-1">
                                <div className="flex items-center gap-2">
                                  <Settings size={14} className="text-landcros" />
                                  <span className="text-[10px] font-black text-black uppercase tracking-tight">Editar Marcação</span>
                                </div>
                                <button onClick={() => setHighlightState(prev => ({ ...prev, activeAnnId: null }))} className="text-zinc-300 hover:text-zinc-500 transition-colors"><X size={16}/></button>
                              </div>
                              
                              {/* Thickness slider for diagram */}
                              <PropertySlider 
                                label="Espessura"
                                value={diagramAnnotations[selectedCategory]?.find(a => a.id === highlightState.activeAnnId)?.strokeWidth || 8}
                                min={1}
                                max={40}
                                unit="px"
                                onInteractionStart={() => { isInteractingRef.current = true; }}
                                onInteractionEnd={() => { isInteractingRef.current = false; }}
                                onChange={(val) => updateAnnotation(highlightState.activeAnnId!, { strokeWidth: val })}
                              />

                              <button 
                                onClick={() => {
                                  removeAnnotation(highlightState.activeAnnId!);
                                  setHighlightState(prev => ({ ...prev, activeAnnId: null }));
                                }}
                                className="w-full py-3 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
                              >
                                Excluir Marcação
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                        <div 
                          ref={innerContainerRef}
                          className="relative flex items-center justify-center"
                          style={{ 
                            aspectRatio: '16/9',
                            width: '100%',
                            height: 'auto',
                            maxWidth: '100%',
                            maxHeight: '100%',
                            transform: `scale(${currentConfig.scale}) translate(${currentConfig.x}px, ${currentConfig.y}px) rotate(${currentConfig.rotation || 0}deg)`,
                            transformOrigin: 'center center'
                          }}
                        >
                          <img 
                            src={imageBlobUrls[selectedCategory] || currentImg || (currentSheet?.photo ? `/${currentSheet.photo}` : `/${selectedCategory}.png`)} 
                            alt={selectedCategory}
                            onClick={handleDiagramClick}
                            className="w-full h-full object-contain transition-opacity duration-300" 
                            onError={(e) => {
                              if (!currentImg && !imageBlobUrls[selectedCategory]) {
                                (e.target as HTMLImageElement).style.opacity = '0';
                              }
                            }}
                            onLoad={(e) => {
                              (e.target as HTMLImageElement).style.opacity = '1';
                            }}
                            style={{ 
                              filter: isBlueprintMode 
                                ? `invert(0.9) contrast(1.3) brightness(1.1) brightness(${currentFilters.brightness}%) contrast(${currentFilters.contrast}%) grayscale(${currentFilters.grayscale}%)` 
                                : `brightness(${currentFilters.brightness}%) contrast(${currentFilters.contrast}%) grayscale(${currentFilters.grayscale}%)`,
                              mixBlendMode: isBlueprintMode ? 'screen' : 'normal',
                            }}
                          />
                          
                          {/* Diagram Annotations Layer */}
                          <div className="absolute inset-0 pointer-events-none">
                            <svg viewBox="0 0 1000 1000" className="w-full h-full">
                              {(diagramAnnotations[selectedCategory] || []).map(ann => (
                                <g key={ann.id} className="pointer-events-auto cursor-pointer" 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setHighlightState(prev => ({ ...prev, activeAnnId: ann.id }));
                                  }}
                                  onMouseDown={(e) => handleAnnMouseDown(e, ann)}
                                >
                                  {ann.type === 'circle' && (
                                    <circle cx={ann.x} cy={ann.y} r={ann.width!/2} fill="none" stroke={ann.color} strokeWidth={ann.strokeWidth || 8} />
                                  )}
                                  {ann.type === 'arrow' && (
                                    <g stroke={ann.color} strokeWidth={ann.strokeWidth || 8} fill="none">
                                      <line x1={ann.x} y1={ann.y} x2={ann.x + Math.cos(ann.rotation || 0) * ann.width!} y2={ann.y + Math.sin(ann.rotation || 0) * ann.width!} />
                                      <path 
                                        d={`M ${ann.x + Math.cos(ann.rotation || 0) * ann.width!} ${ann.y + Math.sin(ann.rotation || 0) * ann.width!} l ${-(ann.strokeWidth || 8) * 2 * Math.cos((ann.rotation || 0) - Math.PI/6)} ${-(ann.strokeWidth || 8) * 2 * Math.sin((ann.rotation || 0) - Math.PI/6)} m ${(ann.strokeWidth || 8) * 2 * Math.cos((ann.rotation || 0) - Math.PI/6)} ${(ann.strokeWidth || 8) * 2 * Math.sin((ann.rotation || 0) - Math.PI/6)} l ${-(ann.strokeWidth || 8) * 2 * Math.cos((ann.rotation || 0) + Math.PI/6)} ${-(ann.strokeWidth || 8) * 2 * Math.sin((ann.rotation || 0) + Math.PI/6)}`} 
                                        stroke={ann.color} 
                                        strokeWidth={ann.strokeWidth || 8} 
                                        strokeLinecap="round" 
                                        strokeLinejoin="round" 
                                      />
                                    </g>
                                  )}
                                  {ann.type === 'box' && (
                                    <rect x={ann.x - ann.width!/2} y={ann.y - ann.height!/2} width={ann.width} height={ann.height} fill="none" stroke={ann.color} strokeWidth={ann.strokeWidth || 8} />
                                  )}
                                  {ann.type === 'text' && (
                                    <text x={ann.x} y={ann.y} fill={ann.color} fontSize={ann.fontSize || 24} fontWeight="900" textAnchor="middle" alignmentBaseline="middle">{ann.text}</text>
                                  )}
                                  {ann.type === 'photo' && ann.photoUrl && (
                                    <g>
                                      <defs>
                                        <clipPath id={`photo-clip-${ann.id}`}>
                                          <circle cx={ann.x} cy={ann.y} r={(ann.width || 0)/2} />
                                        </clipPath>
                                      </defs>
                                      <image 
                                        href={ann.photoUrl} 
                                        x={ann.x - (ann.width || 0)/2} 
                                        y={ann.y - (ann.width || 0)/2} 
                                        width={ann.width} 
                                        height={ann.width} 
                                        clipPath={`url(#photo-clip-${ann.id})`}
                                        preserveAspectRatio="xMidYMid slice"
                                      />
                                      <circle cx={ann.x} cy={ann.y} r={(ann.width || 0)/2} fill="none" stroke={ann.color} strokeWidth={ann.strokeWidth || 4} />
                                    </g>
                                  )}
                                  {highlightState.activeAnnId === ann.id && (
                                    <circle cx={ann.x} cy={ann.y} r={(ann.width || 0)/2 + 10} fill="none" stroke="rgba(242,125,38,0.5)" strokeWidth="2" strokeDasharray="5,5" />
                                  )}
                                </g>
                              ))}
                            </svg>
                          </div>
                          {!currentImg && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center opacity-10 pointer-events-none p-12 text-center -z-10">
                              <MapIcon size={48} className="mb-4 text-black" />
                              <p className="text-[10px] font-bold uppercase tracking-widest text-black">
                                {selectedCategory}.png
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {viewMode === 'bom' && (
                    <div className="flex-1 bg-[#141414] p-8 overflow-y-auto">
                    <div className="flex items-center justify-between mb-8">
                      <div>
                        <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter">
                          {language === 'pt' ? 'LISTA DE PEÇAS (BOM)' : 'PARTS LIST (BOM)'}
                        </h2>
                        <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] mt-1">{language === 'pt' ? 'EDIÇÃO E GERENCIAMENTO DE PART NUMBERS' : 'PART NUMBER MANAGEMENT'}</p>
                      </div>
                      <div className="flex gap-3">
                        <button 
                          onClick={clearCurrentCategoryParts}
                          className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-red-500/20"
                          title={language === 'pt' ? 'Excluir todas as peças customizadas desta sheet' : 'Delete all custom parts from this sheet'}
                        >
                          <Trash2 size={16} />
                          {language === 'pt' ? 'LIMPAR LISTA' : 'CLEAR LIST'}
                        </button>
                        <button 
                          onClick={() => setShowBomModal(true)}
                          className="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-white/10"
                        >
                          <ClipboardList size={16} className="text-landcros" />
                          {language === 'pt' ? 'COLAR BOM' : 'PASTE BOM'}
                        </button>
                        <button 
                          onClick={addNewCustomPart}
                          className="flex items-center gap-2 bg-landcros hover:bg-orange-400 text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-landcros/20"
                        >
                          <Plus size={16} />
                          {t('newItem')}
                        </button>
                      </div>
                    </div>

                    <div className="bg-black/40 rounded-3xl border border-white/5 overflow-hidden">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-white/5">
                            <th className="px-6 py-4 text-[9px] font-black text-zinc-500 uppercase tracking-widest">Sheet</th>
                            <th className="px-6 py-4 text-[9px] font-black text-zinc-500 uppercase tracking-widest">Item</th>
                            <th className="px-6 py-4 text-[9px] font-black text-zinc-500 uppercase tracking-widest">{t('partNumber')}</th>
                            <th className="px-6 py-4 text-[9px] font-black text-zinc-500 uppercase tracking-widest">{language === 'pt' ? 'Descrição' : 'Description'}</th>
                            <th className="px-6 py-4 text-[9px] font-black text-zinc-500 uppercase tracking-widest">{t('actions')}</th>
                            <th className="px-6 py-4 text-[9px] font-black text-zinc-500 uppercase tracking-widest text-right">{t('control')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {filteredParts.map(part => {
                            const inOrder = selectedItems.find(i => i.part.id === part.id && i.type === 'order');
                            const inDamaged = selectedItems.find(i => i.part.id === part.id && i.type === 'damaged');
                            const hasPhoto = selectedItems.find(i => i.part.id === part.id && i.photo);

                            return (
                              <tr key={part.id} className="group hover:bg-white/5 transition-colors">
                                <td className="px-6 py-4 text-[10px] font-bold text-zinc-500 font-mono italic">{part.sheet || '01'}</td>
                                <td className="px-6 py-4 text-lg font-black text-white">{part.itemNumber}</td>
                                <td className="px-6 py-4 text-lg font-black text-white">
                                  <div className="flex items-center gap-2">
                                    {part.partNumber}
                                    {hasPhoto && <Camera size={14} className="text-green-500" strokeWidth={2.5} />}
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-[10px] text-zinc-400 font-mono uppercase italic leading-tight max-w-[200px] truncate">{part.description}</td>
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-2">
                                    {/* Order Button */}
                                    <button 
                                      onClick={() => toggleItem(part, 'order')}
                                      className={`p-2 rounded-xl border transition-all flex items-center gap-2 ${
                                        inOrder ? 'bg-landcros text-white border-landcros shadow-lg shadow-landcros/20' : 'bg-white/5 border-white/5 text-zinc-500 hover:text-white'
                                      }`}
                                      title={t('addToOrder')}
                                    >
                                      <ShoppingCart size={14} />
                                      {inOrder && <span className="text-[8px] font-black">{inOrder.quantity}</span>}
                                    </button>

                                    {/* Damage Button */}
                                    <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/5">
                                      <button 
                                        onClick={() => toggleItem(part, 'damaged')}
                                        className={`p-2 rounded-lg transition-all ${
                                          inDamaged ? 'bg-red-500 text-white shadow-lg' : 'text-zinc-500 hover:text-red-400'
                                        }`}
                                        title={t('reportDamage')}
                                      >
                                        <AlertTriangle size={14} />
                                      </button>
                                      {inDamaged && (
                                        <div className="flex gap-1 pr-1">
                                          {(['A', 'B', 'C'] as Criticality[]).map(c => (
                                            <button 
                                              key={c!}
                                              onClick={() => updateItemCriticality(part.id, 'damaged', c)}
                                              className={`w-5 h-5 rounded text-[8px] font-black flex items-center justify-center transition-all ${
                                                inDamaged.criticality === c 
                                                  ? 'bg-red-500 text-white' 
                                                  : 'bg-black/20 text-zinc-500 hover:text-white'
                                              }`}
                                            >
                                              {c}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                    
                                    {/* Duplicate Button */}
                                    <button 
                                      onClick={() => duplicateItem(part, 'order')}
                                      className="p-2 text-zinc-600 hover:text-landcros transition-colors"
                                      title={t('newItem')}
                                    >
                                      <Copy size={14} />
                                    </button>
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-right">
                                  {part.id.startsWith('custom-') ? (
                                    <button 
                                      onClick={() => deleteCustomPart(part.id)}
                                      className="p-2 text-zinc-600 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                      title="Excluir peça customizada"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  ) : (
                                    <Shield size={16} className="text-zinc-800 ml-auto" />
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {viewMode === 'list' && (
                  <div className="flex-1 bg-[#141414] p-8 overflow-y-auto">
                    <div className="text-center py-20">
                      <List size={48} className="mx-auto text-zinc-700 mb-4" />
                      <h3 className="text-xl font-black text-white uppercase tracking-tighter">Modo Lista Ativo</h3>
                      <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mt-2">Utilize a barra lateral para gerenciar as listas de inspeção</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Side: Details Panel */}
              <AnimatePresence>
                {isDetailsVisible && (
                  <motion.div 
                    initial={{ x: 400, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 400, opacity: 0 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                    className="w-full md:w-[360px] bg-[#141414] border-l border-white/5 flex flex-col shrink-0 z-30"
                  >
                    {/* Sidebar Tabs */}
                    <div className="flex items-center gap-1.5 mx-4 mt-2">
                      <div className="flex-1 flex gap-1 bg-white/5 p-1 rounded-lg">
                        <button 
                          onClick={() => setViewMode('visual')}
                          className={`flex-1 py-1 rounded-md text-[9px] font-black uppercase tracking-widest transition-all ${
                            viewMode === 'visual' ? 'bg-landcros text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'
                          }`}
                        >
                          Diagrama
                        </button>
                        <button 
                          onClick={() => setViewMode('list')}
                          className={`flex-1 py-1 rounded-md text-[9px] font-black uppercase tracking-widest transition-all ${
                            viewMode === 'list' ? 'bg-landcros text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'
                          }`}
                        >
                          Lista
                        </button>
                        <button 
                          onClick={() => setViewMode('bom')}
                          className={`flex-1 py-1 rounded-md text-[9px] font-black uppercase tracking-widest transition-all ${
                            viewMode === 'bom' ? 'bg-landcros text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'
                          }`}
                        >
                          BOM
                        </button>
                      </div>
                      
                      <div className="flex gap-1">
                        <button 
                          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                          className={`p-1.5 rounded-lg border transition-all ${isSidebarCollapsed ? 'bg-landcros/20 text-landcros border-landcros/30' : 'bg-white/5 text-zinc-500 border-white/10 hover:bg-white/10'}`}
                          title="Recolher Diagrama"
                        >
                          <Maximize2 size={12} />
                        </button>
                        <button 
                          onClick={() => setIsBlueprintMode(!isBlueprintMode)}
                          className={`p-1.5 rounded-lg border transition-all ${isBlueprintMode ? 'bg-landcros text-white border-landcros shadow-[0_0_15px_rgba(242,125,38,0.3)]' : 'bg-white/5 text-zinc-500 border-white/10 hover:bg-white/10'}`}
                          title="Modo Blueprint"
                        >
                          <Lightbulb size={12} />
                        </button>
                      </div>
                    </div>

                    {/* Sidebar Controls - Improved Scroll */}
                    <div className="px-4 mt-4 space-y-4 flex-1 overflow-y-auto pb-6 scrollbar-hide">
                      
                      {/* COMANDOS DE IMAGEM (Portuguese Requested Panel - Compact Edition) */}
                      <div className="bg-landcros p-0.5 rounded-xl flex items-center gap-0.5 shadow-lg shadow-landcros/20 group/controls relative">
                        <button 
                          onClick={() => setImgConfigs(prev => ({ ...prev, [selectedCategory]: { ...currentConfig, scale: currentConfig.scale + 0.1 } }))}
                          className="flex-1 h-[32px] hover:bg-white/10 rounded-lg text-white flex justify-center items-center transition-colors"
                          title="Aumentar"
                        >
                          <Plus size={16} />
                        </button>
                        <button 
                          onClick={() => setImgConfigs(prev => ({ ...prev, [selectedCategory]: { ...currentConfig, scale: Math.max(0.1, currentConfig.scale - 0.1) } }))}
                          className="flex-1 h-[32px] hover:bg-white/10 rounded-lg text-white flex justify-center items-center transition-colors"
                          title="Diminuir"
                        >
                          <Minus size={16} />
                        </button>
                        <div className="w-px h-3 bg-white/20" />
                        <button 
                          onClick={() => setImgConfigs(prev => ({ ...prev, [selectedCategory]: { ...currentConfig, rotation: (currentConfig.rotation || 0) + 90 } }))}
                          className="flex-1 h-[32px] hover:bg-white/10 rounded-lg text-white flex justify-center items-center transition-colors"
                          title="Rotacionar"
                        >
                          <RotateCcw size={16} />
                        </button>
                        
                        <div className="w-px h-4 bg-white/10 mx-1" />
                        
                        <div className="flex items-center gap-0.5 bg-black/10 rounded-lg p-0.5" title="Deslocamento">
                          <div className="grid grid-cols-2 gap-0.5">
                            <button onClick={() => setImgConfigs(prev => ({ ...prev, [selectedCategory]: { ...currentConfig, y: currentConfig.y - 20 } }))} className="w-4 h-4 flex items-center justify-center text-white/60 hover:text-white transition-colors bg-white/5 rounded-sm"><ArrowUp size={8}/></button>
                            <button onClick={() => setImgConfigs(prev => ({ ...prev, [selectedCategory]: { ...currentConfig, y: currentConfig.y + 20 } }))} className="w-4 h-4 flex items-center justify-center text-white/60 hover:text-white transition-colors bg-white/5 rounded-sm"><ArrowDown size={8}/></button>
                            <button onClick={() => setImgConfigs(prev => ({ ...prev, [selectedCategory]: { ...currentConfig, x: currentConfig.x - 20 } }))} className="w-4 h-4 flex items-center justify-center text-white/60 hover:text-white transition-colors bg-white/5 rounded-sm"><ArrowLeft size={8}/></button>
                            <button onClick={() => setImgConfigs(prev => ({ ...prev, [selectedCategory]: { ...currentConfig, x: currentConfig.x + 20 } }))} className="w-4 h-4 flex items-center justify-center text-white/60 hover:text-white transition-colors bg-white/5 rounded-sm"><ArrowRight size={8}/></button>
                          </div>
                        </div>

                        <div className="w-px h-3 bg-white/20" />
                        <button 
                          onClick={handleResetZoom}
                          className="flex-[2] h-[32px] hover:bg-white/10 rounded-lg text-white flex items-center justify-center gap-1 transition-colors px-2"
                        >
                          <Maximize2 size={12} />
                          <span className="text-[7px] font-black uppercase tracking-widest leading-none">RESET</span>
                        </button>
                        
                        <button 
                          onClick={() => {
                            const original = selectedCategory;
                            setSelectedCategory('');
                            setTimeout(() => setSelectedCategory(original), 10);
                          }}
                          className="absolute -right-1 -top-1 w-4 h-4 bg-zinc-800 border border-white/10 rounded-full flex items-center justify-center text-zinc-500 hover:text-white transition-opacity opacity-0 group-hover/controls:opacity-100"
                        >
                          <RotateCw size={8} />
                        </button>
                      </div>

                      {/* Focused Part Details */}
                      {focusedPart && (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="bg-zinc-900 border border-white/5 rounded-[32px] p-5 space-y-4 shadow-2xl relative overflow-hidden"
                        >
                          <div className="flex items-start justify-between">
                            <div className="min-w-0">
                              <span className="text-[10px] font-black text-landcros uppercase tracking-[0.2em] mb-1 block">Focused Part</span>
                              <h3 className="text-white font-black text-xl uppercase tracking-tighter leading-none" title={focusedPart.partNumber}>{focusedPart.partNumber}</h3>
                              <p className="text-[10px] text-zinc-600 font-bold italic mt-1 leading-tight">{focusedPart.description}</p>
                            </div>
                            <button onClick={() => setFocusedPart(null)} className="p-2 bg-white/5 text-zinc-500 hover:text-white rounded-full transition-all hover:rotate-90 flex-shrink-0 border border-white/5"><X size={16}/></button>
                          </div>

                          {/* Action Panel Row - Quantity & Order */}
                          <div className="bg-zinc-950/40 border border-white/5 rounded-[22px] p-2 flex items-center justify-between shadow-inner">
                            <div className="flex flex-col">
                              <span className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em] leading-none mb-1.5 pl-1">Quantity</span>
                              <div className="flex items-center gap-4 bg-zinc-900/80 border border-white/5 rounded-xl p-1 shadow-lg">
                                <button 
                                  onClick={() => updateItemQuantity(focusedPart.id, -1)}
                                  className="w-6 h-6 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-all active:scale-90"
                                >
                                  <Minus size={12} strokeWidth={3} />
                                </button>
                                <span className="text-sm font-black text-landcros min-w-[20px] text-center italic">
                                  {localItemQuantity}
                                </span>
                                <button 
                                  onClick={() => updateItemQuantity(focusedPart.id, 1)}
                                  className="w-6 h-6 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-all active:scale-90"
                                >
                                  <Plus size={12} strokeWidth={3} />
                                </button>
                              </div>
                            </div>
                            <div className="h-8 w-[1px] bg-white/10 mx-3 opacity-20" />
                            <div className="flex-1">
                              <button 
                                onClick={() => toggleItem(focusedPart, 'order')}
                                className={`w-full h-10 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all relative overflow-hidden group/order ${
                                  selectedItems.find(i => i.part.id === focusedPart.id && i.type === 'order')
                                    ? 'bg-landcros text-white shadow-xl'
                                    : 'bg-white/5 text-zinc-500 hover:text-white border border-white/5'
                                }`}
                              >
                                <ShoppingCart size={14} className={selectedItems.find(i => i.part.id === focusedPart.id && i.type === 'order') ? 'animate-bounce' : ''} />
                                <span className="text-[8px] font-black uppercase tracking-widest mt-0.5 whitespace-nowrap">{language === 'pt' ? 'Adicionar ao Pedido' : 'Add to Order'}</span>
                              </button>
                            </div>
                          </div>

                          {/* Damage Toggle Button */}
                          <button 
                            onClick={() => toggleItem(focusedPart, 'damaged')}
                            className={`w-full py-2.5 rounded-[20px] flex items-center justify-between px-6 transition-all shadow-xl group/damage ${
                              selectedItems.find(i => i.part.id === focusedPart.id && i.type === 'damaged')
                                ? 'bg-red-500 text-white shadow-red-500/20'
                                : 'bg-white/5 text-zinc-500 border border-white/5 hover:bg-white/10'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                                selectedItems.find(i => i.part.id === focusedPart.id && i.type === 'damaged')
                                  ? 'bg-white/20' 
                                  : 'bg-white/5 text-red-500 group-hover/damage:scale-110'
                              }`}>
                                <AlertTriangle size={16} />
                              </div>
                              <span className="text-[10px] font-black uppercase tracking-[0.15em] leading-none mt-0.5">{language === 'pt' ? 'Reportar Avaria / Dano' : 'Report Damage'}</span>
                            </div>
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all ${
                              selectedItems.find(i => i.part.id === focusedPart.id && i.type === 'damaged')
                                ? 'bg-white border-white text-red-500 rotate-0 scale-100'
                                : 'bg-transparent border-white/10 text-transparent rotate-90 scale-50'
                            }`}>
                              <Check size={12} strokeWidth={4} />
                            </div>
                          </button>

                          {/* Criticality Section */}
                          <AnimatePresence>
                            {selectedItems.find(i => i.part.id === focusedPart.id && i.type === 'damaged') && (
                              <motion.div 
                                initial={{ opacity: 0, height: 0, marginTop: 0 }}
                                animate={{ opacity: 1, height: 'auto', marginTop: 12 }}
                                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                                className="overflow-hidden bg-zinc-950/50 border border-white/5 rounded-[28px] p-4 pt-5 space-y-4 shadow-inner"
                              >
                                <div className="flex items-center justify-between px-1">
                                  <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Criticality</span>
                                  <div className="flex items-center gap-2">
                                    {[
                                      { id: 'A', color: '#ef4444', icon: '!!!' },
                                      { id: 'B', color: '#facc15', icon: '!!' },
                                      { id: 'C', color: '#22c55e', icon: '!' }
                                    ].map(c => {
                                      const isSelected = selectedItems.find(i => i.part.id === focusedPart.id && i.type === 'damaged')?.criticality === c.id;
                                      return (
                                        <button
                                          key={c.id}
                                          onClick={() => updateItemCriticality(focusedPart.id, 'damaged', c.id as Criticality)}
                                          className={`w-12 h-10 rounded-xl flex items-center justify-center transition-all relative ${
                                            isSelected 
                                              ? 'bg-zinc-800 shadow-xl scale-110 z-10 border border-white/10' 
                                              : 'opacity-20 hover:opacity-100'
                                          }`}
                                        >
                                          <div className="relative flex items-center justify-center" style={{ color: c.color }}>
                                            <AlertTriangle size={28} strokeWidth={1} fill={isSelected ? `${c.color}20` : 'none'} />
                                            <span className="absolute text-[8px] font-black mt-2 tracking-tighter">{c.icon}</span>
                                          </div>
                                          {isSelected && (
                                            <motion.div 
                                              layoutId="crit-active"
                                              className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full"
                                              style={{ backgroundColor: c.color }}
                                            />
                                          )}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                                <div className="h-2 w-full bg-black/40 rounded-full overflow-hidden p-[2px] shadow-inner">
                                  <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ 
                                      width: (() => {
                                        const crit = selectedItems.find(i => i.part.id === focusedPart.id && i.type === 'damaged')?.criticality;
                                        if (crit === 'A') return '100%';
                                        if (crit === 'B') return '66%';
                                        return '33%';
                                      })()
                                    }}
                                    className={`h-full rounded-full transition-all duration-500 relative`}
                                    style={{ 
                                      backgroundColor: (() => {
                                        const crit = selectedItems.find(i => i.part.id === focusedPart.id && i.type === 'damaged')?.criticality;
                                        if (crit === 'A') return '#ef4444';
                                        if (crit === 'B') return '#facc15';
                                        return '#22c55e';
                                      })()
                                    }}
                                  >
                                    <div className="absolute right-1 top-1/2 -translate-y-1/2 w-1 h-1 bg-white rounded-full shadow-[0_0_8px_white]" />
                                  </motion.div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>

                          {/* Photos Evidence Section */}
                          <div className="space-y-3 pt-2">
                             <div className="flex items-center justify-between px-1">
                               <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Evidências Fotográficas</span>
                               {selectedItems.find(i => i.part.id === focusedPart.id)?.photo && (
                                 <button 
                                   onClick={deleteInspectionPhoto}
                                   className="p-1.5 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-lg transition-all"
                                 >
                                   <Trash2 size={12} />
                                 </button>
                               )}
                             </div>
                             
                             {(() => {
                                const item = selectedItems.find(i => i.part.id === focusedPart.id);
                                if (!item?.photo) {
                                  return (
                                    <div className="grid grid-cols-2 gap-2.5 bg-zinc-950/40 rounded-[28px] p-4 border border-white/5 shadow-inner">
                                      <button 
                                        onClick={() => setIsCameraOpen(true)}
                                        className="h-32 bg-zinc-900 border border-white/5 rounded-[20px] flex flex-col items-center justify-center gap-3 group hover:border-landcros/30 transition-all shadow-lg active:scale-95"
                                      >
                                        <div className="p-3 bg-zinc-800 rounded-2xl group-hover:bg-landcros/10 group-hover:scale-110 transition-all duration-300">
                                          <Camera size={24} className="text-landcros group-hover:rotate-12" />
                                        </div>
                                        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest group-hover:text-white mt-1">Câmera</span>
                                      </button>
                                      
                                      <label className="h-32 bg-zinc-900 border border-white/5 rounded-[20px] flex flex-col items-center justify-center gap-3 group hover:border-landcros/30 cursor-pointer transition-all shadow-lg active:scale-95">
                                        <div className="p-3 bg-zinc-800 rounded-2xl group-hover:bg-landcros/10 group-hover:scale-110 transition-all duration-300">
                                          <Upload size={24} className="text-zinc-500 group-hover:text-landcros group-hover:-translate-y-1" />
                                        </div>
                                        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest group-hover:text-white mt-1">Galeria</span>
                                        <input type="file" className="hidden" accept="image/*" onChange={handleInspectionPhotoUpload} />
                                      </label>
                                      <div className="col-span-2 text-center pt-1">
                                        <span className="text-[8px] font-black text-zinc-700 uppercase tracking-[0.3em]">Adicionar Evidência</span>
                                      </div>
                                    </div>
                                  );
                                }

                                return (
                                  <div className="relative aspect-[4/3] bg-zinc-950 rounded-[32px] overflow-hidden border-2 border-white/5 shadow-2xl group/photo">
                                    <img 
                                      src={item.photo} 
                                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
                                      alt="Evidência" 
                                    />
                                    
                                    {/* Annotation Static Layer */}
                                    <div className="absolute inset-0 pointer-events-none opacity-90">
                                      <svg viewBox="0 0 1000 1000" className="w-full h-full drop-shadow-lg">
                                        {(item.annotations || []).map(ann => (
                                          <g key={ann.id}>
                                            {ann.type === 'circle' && (
                                              <circle cx={ann.x} cy={ann.y} r={ann.width!/2} fill="none" stroke={ann.color} strokeWidth="8" />
                                            )}
                                            {ann.type === 'arrow' && (
                                              <g stroke={ann.color} strokeWidth="8" fill="none">
                                                <line x1={ann.x} y1={ann.y} x2={ann.x + Math.cos(ann.rotation || 0) * ann.width!} y2={ann.y + Math.sin(ann.rotation || 0) * ann.width!} />
                                              </g>
                                            )}
                                          </g>
                                        ))}
                                      </svg>
                                    </div>

                                    {/* Photo Actions Overlay */}
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover/photo:opacity-100 transition-all duration-300 backdrop-blur-[2px] p-6">
                                      <div className="grid grid-cols-4 gap-3 w-full">
                                        <button 
                                          onClick={() => setHighlightState({ isOpen: true, activeAnnId: null })}
                                          className="aspect-square rounded-2xl bg-landcros text-white flex items-center justify-center transition-all hover:scale-110 active:scale-90 shadow-xl"
                                          title="Marcar Área"
                                        >
                                          <Target size={24} />
                                        </button>
                                        <button 
                                          onClick={() => setIsCameraOpen(true)}
                                          className="aspect-square rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-white flex items-center justify-center transition-all hover:scale-110 active:scale-90 shadow-xl"
                                          title="Trocar Foto"
                                        >
                                          <Camera size={24} />
                                        </button>
                                        <label className="aspect-square rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-white flex items-center justify-center transition-all hover:scale-110 active:scale-90 shadow-xl cursor-pointer">
                                          <Upload size={24} />
                                          <input type="file" className="hidden" accept="image/*" onChange={handleInspectionPhotoUpload} />
                                        </label>
                                        <button 
                                          onClick={deleteInspectionPhoto}
                                          className="aspect-square rounded-2xl bg-red-500/20 hover:bg-red-500 text-red-500 hover:text-white flex items-center justify-center transition-all hover:scale-110 active:scale-90 shadow-xl"
                                          title="Remover Foto"
                                        >
                                          <Trash2 size={24} />
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                );
                             })()}
                          </div>
                        </motion.div>
                      )}

                      <div className="grid grid-cols-4 gap-2">
                        <div className="space-y-1">
                          <label className="text-[7.5px] font-black text-zinc-500 uppercase tracking-widest">Item #</label>
                          <div className="bg-white/5 border border-white/10 rounded-lg text-center h-[34px] flex items-center justify-center shadow-inner">
                            <span className="text-sm font-black text-white">{focusedPart?.itemNumber || '00'}</span>
                          </div>
                        </div>
                        <div className="col-span-3 space-y-1">
                          <label className="text-[7.5px] font-black text-zinc-500 uppercase tracking-widest">Busca Geral</label>
                          <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" size={12} />
                            <input 
                              type="text" 
                              placeholder="Part # ou Descrição"
                              value={searchTerm}
                              onChange={(e) => setSearchTerm(e.target.value)}
                              className="w-full bg-white/5 border border-white/10 rounded-lg py-2 pl-8 pr-3 text-[9px] text-white placeholder:text-zinc-700 focus:outline-none focus:border-landcros/50 transition-all h-[34px] shadow-inner"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Local Image Upload for the selected sheet */}
                      <label className="w-full cursor-pointer bg-white/5 hover:bg-white/10 text-zinc-500 p-2 rounded-lg text-[8px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 border border-dashed border-white/10">
                        <ImageIcon size={12} />
                        {language === 'pt' ? 'Imagens da Sheet' : 'Sheet Images'}
                        <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                      </label>

                      <div className="pt-1">
                        <span className="text-[7.5px] font-black text-zinc-500 uppercase tracking-widest block mb-2">{language === 'pt' ? 'Peças na Sheet' : 'Parts on Sheet'}</span>
                        <div className="space-y-2">
                          {filteredParts.map(part => {
                            const hasPhoto = selectedItems.find(i => (i.part.id === part.id || i.part.id.startsWith(part.id + '-clone-')) && i.photo);
                            return (
                              <button
                                key={part.id}
                                onClick={() => setFocusedPart(part)}
                                className={`w-full text-left p-2.5 rounded-xl border transition-all group ${
                                  focusedPart?.id === part.id 
                                    ? 'bg-landcros/5 border-landcros shadow-[0_0_15px_rgba(242,125,38,0.1)]' 
                                    : 'bg-white/5 border-white/5 hover:border-white/10'
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 bg-black/40 rounded-lg flex items-center justify-center text-zinc-500 font-black text-sm group-hover:text-landcros transition-colors shrink-0">
                                    {part.itemNumber}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 mb-0.5">
                                      <span className="text-[7px] font-black text-landcros uppercase tracking-tighter">{t('partNumber')}</span>
                                      {hasPhoto && <Camera size={10} className="text-green-500" strokeWidth={2.5} />}
                                    </div>
                                    <h4 className="text-sm font-black text-white tracking-tighter truncate leading-none mb-0.5">{part.partNumber}</h4>
                                    <p className="text-[9px] text-zinc-600 font-mono italic truncate leading-none pb-0.5">{part.description}</p>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Full-width Footer statistics */}
                    <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between text-[10px] font-black px-1 pb-2">
                      <div className="flex flex-col">
                        <span className="text-zinc-600 uppercase tracking-[0.2em] leading-none mb-1.5 text-[8px]">Orders</span>
                        <span className="text-landcros text-2xl leading-none font-black italic">{orderList.length}</span>
                      </div>
                      <div className="h-10 w-px bg-white/5" />
                      <div className="flex flex-col text-right">
                        <span className="text-zinc-600 uppercase tracking-[0.2em] leading-none mb-1.5 text-[8px]">Damages</span>
                        <span className="text-red-500 text-2xl leading-none font-black italic">{damagedList.length}</span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </>
        )}

        {(activeTab === 'order' || activeTab === 'damaged') && (
          <div className="p-8 md:p-12 max-w-4xl mx-auto space-y-12">
            <div className="flex items-end justify-between">
              <div>
                <button 
                  onClick={() => setActiveTab('inspect')}
                  className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors text-xs font-bold uppercase tracking-widest mb-4"
                >
                  <ArrowLeft size={14} /> {language === 'pt' ? 'Voltar para Inspeção' : 'Back to Inspection'}
                </button>
                <h2 className="text-5xl font-black tracking-tighter text-white italic uppercase">
                  {activeTab === 'order' ? (language === 'pt' ? 'Lista de Pedidos' : 'Order List') : (language === 'pt' ? 'Relatório de Avarias' : 'Damage Report')}
                </h2>
              </div>
              <button 
                onClick={exportToPDF}
                disabled={(activeTab === 'order' ? orderList : damagedList).length === 0}
                className="bg-white text-black px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-zinc-200 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download size={16} /> {language === 'pt' ? 'Exportar PDF' : 'Export PDF'}
              </button>
            </div>

            <div className="space-y-4">
              {(activeTab === 'order' ? orderList : damagedList).length > 0 ? (
                (activeTab === 'order' ? orderList : damagedList).map(({ part, timestamp }) => (
                  <motion.div 
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={`${part.id}-${activeTab}`} 
                    className="group bg-[#141414]/80 backdrop-blur-md border border-white/5 p-6 rounded-3xl flex items-center justify-between hover:border-white/20 transition-all"
                  >
                    <div className="flex gap-6 items-center">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${activeTab === 'order' ? 'bg-landcros/10 text-landcros' : 'bg-red-500/10 text-red-500'}`}>
                        {activeTab === 'order' ? <ShoppingCart size={24} /> : <AlertTriangle size={24} />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-white/5 text-zinc-400 rounded uppercase tracking-wider">
                            Sheet {part.sheet}
                          </span>
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-white/5 text-zinc-400 rounded uppercase tracking-wider">
                            Item {part.itemNumber}
                          </span>
                          {part.id.includes('-clone-') && (
                            <span className="text-[8px] font-black bg-landcros/20 text-landcros px-2 py-0.5 rounded uppercase tracking-tighter">
                              {language === 'pt' ? 'Cópia' : 'Copy'}
                            </span>
                          )}
                        </div>
                        <h4 className="text-xl font-bold text-white tracking-tight">{part.partNumber}</h4>
                        <p className="text-sm text-zinc-500 font-mono italic">{part.description}</p>
                        {part.photo && (
                          <div className="mt-3 w-32 aspect-video rounded-lg overflow-hidden border border-white/10">
                            <img src={part.photo} className="w-full h-full object-cover" alt="Inspeção" />
                          </div>
                        )}
                      </div>
                    </div>
                    <button 
                      onClick={() => toggleItem(part, activeTab)}
                      className="p-3 text-zinc-700 hover:text-red-500 transition-colors"
                    >
                      <XCircle size={24} />
                    </button>
                  </motion.div>
                ))
              ) : (
                <div className="py-32 text-center space-y-6 opacity-20">
                  <ClipboardList size={64} className="mx-auto" />
                  <p className="text-xl font-bold tracking-tight">{language === 'pt' ? 'Nenhum item registrado nesta lista.' : 'No items registered in this list.'}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Highlight Modal (Advanced Annotation) */}
      <AnimatePresence>
        {highlightState.isOpen && focusedPart && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-[#0c0c0c] flex flex-col font-sans"
          >
            {/* Header / Top Toolbar */}
            <div className="relative p-6 flex items-center justify-between z-50 shrink-0 border-b border-white/5 bg-[#0c0c0c]">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setIsHighlightToolbarVisible(!isHighlightToolbarVisible)}
                  className={`px-4 py-2 rounded-2xl transition-all flex items-center gap-2 border ${isHighlightToolbarVisible ? 'bg-zinc-900 border-white/10 text-white' : 'bg-landcros border-landcros text-white shadow-lg shadow-landcros/20'}`}
                >
                  <Wrench size={16}/>
                  <span className="text-[12px] font-black uppercase tracking-widest">{isHighlightToolbarVisible ? 'Ocultar' : 'Ferramentas'}</span>
                </button>
                <div className="h-4 w-[1px] bg-white/10" />
                <div className="w-10 h-10 rounded-2xl bg-landcros/20 flex items-center justify-center text-landcros">
                  <Target size={24} />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500 block leading-none mb-1">Highlight Mode</span>
                  <h2 className="text-white font-black text-lg uppercase tracking-tight leading-none">{focusedPart.partNumber}</h2>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex bg-zinc-900 border border-white/5 rounded-2xl p-1 gap-1">
                  <button onClick={() => { isInteractingRef.current = true; setIsCameraOpen(true); }} className="p-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-xl transition-all" title="Câmera"><Camera size={20}/></button>
                  <label className="p-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-xl transition-all cursor-pointer" title="Galeria">
                    <Upload size={20}/>
                    <input type="file" className="hidden" accept="image/*" onChange={(e) => { isInteractingRef.current = true; handleInspectionPhotoUpload(e); }} />
                  </label>
                  <button onClick={() => { isInteractingRef.current = true; deleteInspectionPhoto(); }} className="p-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-xl transition-all" title="Excluir"><Trash2 size={20}/></button>
                </div>
                <button 
                  onClick={() => { isInteractingRef.current = false; setHighlightState({ ...highlightState, isOpen: false }); }}
                  className="p-4 bg-white/5 hover:bg-white/10 rounded-2xl text-white transition-all backdrop-blur-md border border-white/5"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            {/* Static Toolbar (Not overlapping image) */}
            <AnimatePresence mode="wait">
              {isHighlightToolbarVisible && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="bg-[#141414] border-b border-white/10 px-6 py-3 flex items-center justify-center gap-10 z-40 shrink-0 overflow-hidden"
                >
                  <div className="flex gap-2">
                    {[
                      { color: '#000000', label: 'Black' },
                      { color: '#f27d26', label: 'Landcros' },
                      { color: '#ef4444', label: 'Danger' },
                      { color: '#22c55e', label: 'OK' },
                      { color: '#ffffff', label: 'Info' }
                    ].map(c => (
                      <button
                        key={c.color}
                        onClick={() => setActiveColor(c.color)}
                        className={`w-8 h-8 rounded-full border-2 transition-all relative ${activeColor === c.color ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-60 hover:opacity-100'}`}
                        style={{ backgroundColor: c.color }}
                      >
                        {activeColor === c.color && <motion.div layoutId="color-dot-modal" className="absolute -top-1 -right-1 w-3 h-3 bg-white rounded-full flex items-center justify-center text-black shadow-lg"><Check size={8} strokeWidth={4}/></motion.div>}
                      </button>
                    ))}
                  </div>

                  <div className="h-6 w-[1px] bg-white/10" />

                  <div className="flex gap-1">
                    {[
                      { id: 'none', icon: MousePointer2, label: 'Mouse' },
                      { id: 'circle', icon: Target, label: 'Círculo' },
                      { id: 'arrow', icon: Navigation, label: 'Seta' },
                      { id: 'box', icon: Square, label: 'Box' },
                      { id: 'text', icon: Type, label: 'Texto' },
                      { id: 'callout', icon: Tag, label: 'Callout' },
                      { id: 'crop-circle', icon: Aperture, label: 'Lupa' },
                      { id: 'photo', icon: ImageIcon, label: 'Foto' },
                      { id: 'eraser', icon: Eraser, label: 'Borracha' }
                    ].map(tool => (
                      <button
                        key={tool.id}
                        onClick={() => setActiveTool(tool.id as AnnotationType)}
                        className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-all relative group ${
                          activeTool === tool.id 
                            ? 'bg-landcros text-white shadow-xl' 
                            : 'bg-white/5 text-zinc-500 hover:text-zinc-200 hover:bg-white/10'
                        }`}
                      >
                        <tool.icon size={16} className={tool.id === 'arrow' ? 'rotate-45' : ''} />
                        <span className="text-[9px] font-black uppercase tracking-tight">{tool.label}</span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Main Workspace */}
            <div className="flex-1 relative overflow-hidden flex items-center justify-center p-20 bg-[radial-gradient(circle_at_center,_#1a1a1a_0%,_#0c0c0c_100%)]">
              <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
              
              <div 
                className="relative aspect-[4/3] w-full max-w-5xl bg-black rounded-[48px] overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.8)] border-4 border-white/5 group"
                onClick={(e) => {
                  if (activeTool === 'none') return;
                  if (!activeHighlightItem) return;

                  const rect = e.currentTarget.getBoundingClientRect();
                  const mx = (e.clientX - rect.left) / rect.width * 1000;
                  const my = (e.clientY - rect.top) / rect.height * 1000;

                  if (activeTool === 'eraser') {
                    const filtered = (activeHighlightItem.annotations || []).filter(ann => {
                      const dist = Math.sqrt(Math.pow(ann.x - mx, 2) + Math.pow(ann.y - my, 2));
                      return dist > 50; 
                    });
                    updateItemAnnotations(activeHighlightItem.part.id, activeHighlightItem.type, filtered);
                    return;
                  }

                  if (activeTool === 'photo') {
                    setPendingAnnotation({ x: mx, y: my, isDiagram: false, itemId: focusedPart.id, itemType: activeHighlightItem.type });
                    annotationFileRef.current?.click();
                    return;
                  }

                  const annId = `ann-${Date.now()}`;
                  const ann: Annotation = {
                    id: annId,
                    type: activeTool,
                    x: mx, y: my,
                    color: activeColor,
                    width: activeTool === 'arrow' ? 150 : 80,
                    height: 80,
                    rotation: activeTool === 'arrow' ? -Math.PI/4 : 0,
                    strokeWidth: 8,
                    fontSize: 24,
                    text: activeTool === 'text' || activeTool === 'callout' ? (language === 'pt' ? 'NOVO TEXTO' : 'NEW TEXT') : undefined
                  };

                  updateItemAnnotations(activeHighlightItem.part.id, activeHighlightItem.type, [...(activeHighlightItem.annotations || []), ann]);
                  setHighlightState(prev => ({ ...prev, activeAnnId: annId }));
                  isInteractingRef.current = false; // Release immediately after stamp
                }}
              >
                {activeHighlightItem?.photo ? (
                  <>
                    <img 
                      src={activeItemBlobUrl || activeHighlightItem.photo} 
                      className="w-full h-full object-cover select-none" 
                      style={{ willChange: 'transform', transform: 'translateZ(0)' }}
                      alt="Annotation Canvas" 
                    />
                    
                    <div className="absolute inset-0" style={{ willChange: 'transform', transform: 'translateZ(0)' }}>
                      <svg viewBox="0 0 1000 1000" className={`w-full h-full ${isHighlightDragging ? '' : 'drop-shadow-2xl'}`}>
                        <defs>
                          <image 
                            id={`highres-photo-${focusedPart?.id}`}
                            href={activeItemBlobUrl || activeHighlightItem.photo} 
                            width="1000" 
                            height="1000" 
                          />
                        </defs>
                        {(activeHighlightItem.annotations || []).map(ann => {
                          const isActive = highlightState.activeAnnId === ann.id;
                              return (
                                <g 
                                  key={ann.id} 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setHighlightState(prev => ({ ...prev, activeAnnId: ann.id }));
                                  }}
                                  onMouseDown={(e) => handleAnnMouseDown(e, ann)}
                                  className="cursor-pointer pointer-events-auto"
                                >
                                  {ann.type === 'circle' && (
                                    <circle cx={ann.x} cy={ann.y} r={ann.width!/2} fill="none" stroke={ann.color} strokeWidth={ann.strokeWidth || 8} strokeDasharray={ann.dash ? "15,10" : "none"} />
                                  )}
                                  {ann.type === 'arrow' && (
                                    <g stroke={ann.color} strokeWidth={ann.strokeWidth || 8} fill="none">
                                      <line x1={ann.x} y1={ann.y} x2={ann.x + Math.cos(ann.rotation || 0) * ann.width!} y2={ann.y + Math.sin(ann.rotation || 0) * ann.width!} />
                                      {/* Arrow head */}
                                      <path 
                                        d={`M ${ann.x + Math.cos(ann.rotation || 0) * ann.width!} ${ann.y + Math.sin(ann.rotation || 0) * ann.width!} l ${-(ann.strokeWidth || 8) * 2 * Math.cos((ann.rotation || 0) - Math.PI/6)} ${-(ann.strokeWidth || 8) * 2 * Math.sin((ann.rotation || 0) - Math.PI/6)} m ${(ann.strokeWidth || 8) * 2 * Math.cos((ann.rotation || 0) - Math.PI/6)} ${(ann.strokeWidth || 8) * 2 * Math.sin((ann.rotation || 0) - Math.PI/6)} l ${-(ann.strokeWidth || 8) * 2 * Math.cos((ann.rotation || 0) + Math.PI/6)} ${-(ann.strokeWidth || 8) * 2 * Math.sin((ann.rotation || 0) + Math.PI/6)}`} 
                                        stroke={ann.color} 
                                        strokeWidth={ann.strokeWidth || 8} 
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      />
                                    </g>
                                  )}
                                  {ann.type === 'box' && (
                                    <rect x={ann.x - ann.width!/2} y={ann.y - ann.height!/2} width={ann.width} height={ann.height} fill="none" stroke={ann.color} strokeWidth={ann.strokeWidth || 8} strokeDasharray={ann.dash ? "15,10" : "none"} />
                                  )}
                                  {ann.type === 'text' && (
                                    <text x={ann.x} y={ann.y} fill={ann.color} fontSize={ann.fontSize || 24} fontWeight="900" textAnchor="middle" alignmentBaseline="middle" className="select-none uppercase tracking-tight font-sans">{ann.text || 'TEXT'}</text>
                                  )}
                                  {ann.type === 'crop-circle' && (
                                    <g style={{ willChange: 'transform' }}>
                                      <defs>
                                        <clipPath id={`clip-${ann.id}`}>
                                          <circle cx={ann.x} cy={ann.y} r={ann.width!/2} />
                                        </clipPath>
                                      </defs>
                                      
                                      {/* Magnified Content */}
                                      <g clipPath={`url(#clip-${ann.id})`}>
                                        <use 
                                          href={`#highres-photo-${focusedPart?.id}`}
                                          transform={`translate(${ann.x}, ${ann.y}) scale(2) translate(${-ann.x}, ${-ann.y})`}
                                        />
                                      </g>

                                      {/* Highlight Circle Border */}
                                      <circle 
                                        cx={ann.x} cy={ann.y} r={ann.width!/2} 
                                        fill="none" 
                                        stroke={ann.color} 
                                        strokeWidth={ann.strokeWidth || 8} 
                                        className={isHighlightDragging ? '' : 'drop-shadow-lg'}
                                      />
                                      
                                      {/* Decorative rings for 'Magnifier' look */}
                                      <circle cx={ann.x} cy={ann.y} r={ann.width!/2 + (ann.strokeWidth || 8)} fill="none" stroke="white" strokeWidth="1" opacity="0.1" />
                                      <circle cx={ann.x} cy={ann.y} r={ann.width!/2 - (ann.strokeWidth || 8)} fill="none" stroke="black" strokeWidth="1" opacity="0.1" />
                                    </g>
                                  )}
                                  {ann.type === 'photo' && ann.photoUrl && (
                                    <g>
                                      <defs>
                                        <clipPath id={`modal-photo-clip-${ann.id}`}>
                                          <circle cx={ann.x} cy={ann.y} r={ann.width!/2} />
                                        </clipPath>
                                      </defs>
                                      <image 
                                        href={annotationBlobUrls[ann.id] || ann.photoUrl} 
                                        x={ann.x - ann.width!/2} 
                                        y={ann.y - ann.width!/2} 
                                        width={ann.width} 
                                        height={ann.width} 
                                        clipPath={`url(#modal-photo-clip-${ann.id})`}
                                        preserveAspectRatio="xMidYMid slice"
                                      />
                                      <circle cx={ann.x} cy={ann.y} r={ann.width!/2} fill="none" stroke={ann.color} strokeWidth={ann.strokeWidth || 4} />
                                    </g>
                                  )}
                                  {isActive && (
                                    <g>
                                      <circle cx={ann.x} cy={ann.y} r={ann.width!/2 + 20} fill="none" stroke="white" strokeWidth="2" strokeDasharray="5,5" className="animate-[spin_4s_linear_infinite]" />
                                      <circle cx={ann.x} cy={ann.y} r="10" fill="white" className="shadow-lg" />
                                    </g>
                                  )}
                                </g>
                              );
                            })}
                          </svg>
                        </div>
                      </>
                    ) : null}
                  </div>

              {/* Fine-Tuning Floater (Ajustes) */}
              {activeHighlightAnn && (
                <motion.div 
                  drag
                  dragMomentum={false}
                  initial={{ opacity: 0, x: 100 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="absolute right-10 top-1/3 w-64 bg-[#141414]/95 backdrop-blur-xl border border-white/10 rounded-[32px] p-6 shadow-2xl cursor-move space-y-6 z-[70]"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-landcros/20 flex items-center justify-center text-landcros"><Settings size={18}/></div>
                      <span className="text-[10px] font-black text-white uppercase tracking-widest leading-none">Ajustes</span>
                    </div>
                    <button onClick={() => setHighlightState(prev => ({ ...prev, activeAnnId: null }))} className="text-zinc-500 hover:text-white transition-colors"><X size={16}/></button>
                  </div>

                  <div className="space-y-4">
                    {/* Size Control */}
                    <PropertySlider 
                      label={activeHighlightAnn.type === 'text' ? 'Tamanho da Fonte' : 'Tamanho'}
                      value={activeHighlightAnn.type === 'text' ? (activeHighlightAnn.fontSize || 24) : (activeHighlightAnn.width || 100)}
                      min={activeHighlightAnn.type === 'text' ? 10 : 20}
                      max={activeHighlightAnn.type === 'text' ? 200 : 800}
                      onInteractionStart={() => { isInteractingRef.current = true; }}
                      onInteractionEnd={() => { isInteractingRef.current = false; }}
                      onChange={(val) => {
                        if (!activeHighlightItem) return;
                        const updated = (activeHighlightItem.annotations || []).map(a => {
                          if (a.id === highlightState.activeAnnId) {
                            if (a.type === 'text') return { ...a, fontSize: val };
                            return { ...a, width: val, height: val };
                          }
                          return a;
                        });
                        updateItemAnnotations(activeHighlightItem.part.id, activeHighlightItem.type, updated);
                      }}
                    />

                    {/* Thickness Control */}
                    {activeHighlightAnn.type !== 'text' && (
                      <PropertySlider 
                        label="Espessura"
                        value={activeHighlightAnn.strokeWidth || 8}
                        min={1}
                        max={40}
                        unit="px"
                        onInteractionStart={() => { isInteractingRef.current = true; }}
                        onInteractionEnd={() => { isInteractingRef.current = false; }}
                        onChange={(val) => {
                          if (!activeHighlightItem) return;
                          const updated = (activeHighlightItem.annotations || []).map(a => a.id === highlightState.activeAnnId ? { ...a, strokeWidth: val } : a);
                          updateItemAnnotations(activeHighlightItem.part.id, activeHighlightItem.type, updated);
                        }}
                      />
                    )}

                    {/* Text Edit Control */}
                    {(activeHighlightAnn.type === 'text' || activeHighlightAnn.type === 'callout') && (
                      <PropertyInput 
                        label="Conteúdo do Texto"
                        value={activeHighlightAnn.text || ''}
                        onChange={(val) => {
                          if (!activeHighlightItem) return;
                          const updated = (activeHighlightItem.annotations || []).map(a => a.id === highlightState.activeAnnId ? { ...a, text: val.toUpperCase() } : a);
                          updateItemAnnotations(activeHighlightItem.part.id, activeHighlightItem.type, updated);
                        }}
                      />
                    )}

                    <button 
                      onClick={() => {
                        if (!activeHighlightItem) return;
                        const updated = (activeHighlightItem.annotations || []).filter(a => a.id !== highlightState.activeAnnId);
                        updateItemAnnotations(activeHighlightItem.part.id, activeHighlightItem.type, updated);
                        setHighlightState(prev => ({ ...prev, activeAnnId: null }));
                      }}
                      className="w-full py-4 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-2xl flex items-center justify-center gap-3 transition-all text-[10px] font-black uppercase tracking-widest shadow-lg"
                    >
                      <Trash2 size={16} /> Excluir Ajuste
                    </button>
                    <div className="text-center opacity-30 text-[8px] font-bold uppercase tracking-[0.3em]">Arraste para mover</div>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Camera Modal */}
      <AnimatePresence>
        {isCameraOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black flex flex-col"
          >
            <div className="absolute top-0 left-0 right-0 p-6 flex items-center justify-between z-10 bg-gradient-to-b from-black/60 to-transparent">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white">{language === 'pt' ? 'Câmera ao Vivo' : 'Live Camera'}</span>
              </div>
              <button 
                onClick={stopCamera}
                className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all backdrop-blur-md"
              >
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 relative overflow-hidden flex items-center justify-center bg-zinc-950">
              {!cameraStream && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-20">
                  <div className="w-12 h-12 border-4 border-landcros/20 border-t-landcros rounded-full animate-spin" />
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{language === 'pt' ? 'Iniciando Câmera...' : 'Starting Camera...'}</span>
                </div>
              )}
              <video 
                ref={videoRef}
                autoPlay 
                playsInline 
                muted
                onLoadedMetadata={(e) => {
                  const video = e.currentTarget;
                  video.play().catch(err => console.error("Video play error:", err));
                }}
                className="w-full h-full object-cover"
              />
              
              {/* Camera Overlay UI */}
              <div className="absolute inset-0 pointer-events-none border-[40px] border-black/20">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 border border-white/20 rounded-3xl" />
                <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-landcros m-4" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-landcros m-4" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-landcros m-4" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-landcros m-4" />
              </div>
            </div>

            <div className="p-12 bg-black flex items-center justify-between px-20 relative">
              <label 
                className="w-14 h-14 rounded-full bg-white/5 hover:bg-white/10 flex flex-col items-center justify-center text-zinc-500 transition-all cursor-pointer group"
                title={language === 'pt' ? "Anexar Arquivo Local" : "Attach Local File"}
              >
                <Upload size={18} className="group-hover:text-landcros transition-colors" />
                <span className="text-[7px] font-black mt-1 uppercase tracking-tight">{language === 'pt' ? 'Anexar' : 'Attach'}</span>
                <input 
                  type="file" 
                  className="hidden" 
                  accept="image/*" 
                  onChange={(e) => {
                    handleInspectionPhotoUpload(e);
                    stopCamera();
                  }} 
                />
              </label>
              
              <button 
                onClick={capturePhoto}
                className="w-24 h-24 rounded-full border-4 border-white/20 p-1 hover:scale-105 transition-transform active:scale-95 group relative overflow-hidden"
                title={language === 'pt' ? "Capturar Foto" : "Capture Photo"}
              >
                <div className="w-full h-full rounded-full bg-white flex items-center justify-center group-active:bg-zinc-200 transition-colors">
                  <div className="w-16 h-16 rounded-full border-2 border-black/5" />
                </div>
              </button>

              <button 
                onClick={toggleCamera}
                className="w-14 h-14 rounded-full bg-white/5 hover:bg-white/10 flex flex-col items-center justify-center text-zinc-500 transition-all group"
                title={language === 'pt' ? "Girar Câmera" : "Rotate Camera"}
              >
                <RotateCcw size={18} className="group-hover:text-white transition-colors" />
                <span className="text-[7px] font-black mt-1 uppercase tracking-tight">{language === 'pt' ? 'Girar' : 'Rotate'}</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* BOM Import Modal */}
      <AnimatePresence>
        {showBomModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowBomModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-[#1a1a1a] border border-white/10 rounded-[32px] overflow-hidden shadow-2xl"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter">{language === 'pt' ? 'COLAR DADOS DO BOM' : 'PASTE BOM DATA'}</h2>
                  <button 
                    onClick={() => setShowBomModal(false)}
                    className="p-2 hover:bg-white/5 rounded-xl text-zinc-500 transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>
                <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-8">{language === 'pt' ? 'COPIE E COLE AS COLUNAS DA TABELA (EXCEL, PDF, ETC.)' : 'COPY AND PASTE THE TABLE COLUMNS (EXCEL, PDF, ETC.)'}</p>

                <div className="bg-black/40 border border-white/5 rounded-2xl p-6 mb-8">
                  <textarea 
                    placeholder={language === 'pt' ? "Cole aqui os dados da tabela...\nExemplo:\n02 A852244 ELBOW;S\n02A 4506418 O-RING" : "Paste table data here...\nExample:\n02 A852244 ELBOW;S\n02A 4506418 O-RING"}
                    value={bomInput}
                    onChange={(e) => setBomInput(e.target.value)}
                    className="w-full h-[200px] bg-transparent text-zinc-400 text-xs font-mono placeholder:text-zinc-700 focus:outline-none resize-none"
                  />
                </div>

                <div className="flex gap-4">
                  <button 
                    onClick={() => setShowBomModal(false)}
                    className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border border-white/5"
                  >
                    {language === 'pt' ? 'CANCELAR' : 'CANCEL'}
                  </button>
                  <button 
                    onClick={handleImportBom}
                    className="flex-1 py-4 bg-landcros hover:bg-orange-400 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-landcros/20"
                  >
                    {language === 'pt' ? 'IMPORTAR PEÇAS' : 'IMPORT PARTS'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
