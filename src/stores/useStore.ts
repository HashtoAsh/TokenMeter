import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/tauri';
import type { ModelConfig, DailyStats, DockSide, EdgeState } from '../types';

// 历史查询相关类型
interface DailyDetail {
  date: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  requestCount: number;
  totalCost: number;
}

interface DailyCost {
  date: string;
  cost: number;
}

interface ApiKeyInfo {
  apiKeyMask: string;
  provider: string;
}

interface RecordItem {
  id: number;
  timestamp: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  ignored: boolean;
}

interface QueryParams {
  dimension: 'api' | 'model' | 'total';
  filter?: string;
  date: string;
}

interface AppState {
  // 模型列表
  models: ModelConfig[];
  // 各模型今日统计
  stats: Record<string, DailyStats>;
  // 各模型最近一次轮询状态（成功/失败）
  pollStatus: Record<string, { ok: boolean; error?: string }>;
  // 当前选中的模型ID
  selectedModelId: string | null;
  // 贴边状态
  edgeState: EdgeState;
  // 贴边方向（窗口靠在屏幕哪一侧）：决定展开时向哪边生长
  dockSide: DockSide;
  // 是否正在拖动窗口：拖动期间不响应“鼠标移出 → 自动收起”
  dragging: boolean;
  // “添加/编辑模型”子窗口是否打开：打开期间主窗口保持展开，不自动收起
  childWindowOpen: boolean;

  // 历史查询相关
  queryDimension: 'api' | 'model' | 'total';
  queryFilter: string | null;
  selectedDate: string;
  dailyDetail: DailyDetail | null;
  dailyCosts: DailyCost[];
  apiKeyList: ApiKeyInfo[];
  dailyRecords: RecordItem[];
  showIgnored: boolean;

  // Actions
  fetchModels: () => Promise<void>;
  fetchAllStats: () => Promise<void>;
  deleteModel: (id: string) => Promise<void>;
  setSelectedModel: (id: string | null) => void;
  setEdgeState: (state: EdgeState) => void;
  setDockSide: (side: DockSide) => void;
  setDragging: (dragging: boolean) => void;
  setChildWindowOpen: (open: boolean) => void;
  setPollStatus: (id: string, status: { ok: boolean; error?: string }) => void;

  // 历史查询 Actions
  setQueryDimension: (dimension: 'api' | 'model' | 'total') => void;
  setQueryFilter: (filter: string | null) => void;
  setSelectedDate: (date: string) => void;
  setShowIgnored: (show: boolean) => void;
  fetchDailyDetail: () => Promise<void>;
  fetchDailyCosts: (days: number) => Promise<void>;
  fetchApiKeyList: () => Promise<void>;
  fetchDailyRecords: () => Promise<void>;
  ignoreRecord: (recordId: number) => Promise<void>;
  unignoreRecord: (recordId: number) => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
  models: [],
  stats: {},
  pollStatus: {},
  selectedModelId: null,
  edgeState: 'docked',
  dockSide: 'right',
  dragging: false,
  childWindowOpen: false,

  // 历史查询状态
  queryDimension: 'total',
  queryFilter: null,
  selectedDate: new Date().toISOString().split('T')[0], // 默认今天
  dailyDetail: null,
  dailyCosts: [],
  apiKeyList: [],
  dailyRecords: [],
  showIgnored: false,

  fetchModels: async () => {
    try {
      const models = await invoke<ModelConfig[]>('get_models');
      set({ models });
      // 如果没有选中模型，默认选中第一个
      if (!get().selectedModelId && models.length > 0) {
        set({ selectedModelId: models[0].id });
      }
    } catch (e) {
      console.error('获取模型列表失败:', e);
    }
  },

  fetchAllStats: async () => {
    try {
      const stats = await invoke<Record<string, DailyStats>>('get_all_daily_stats');
      set({ stats });
    } catch (e) {
      console.error('获取统计数据失败:', e);
    }
  },

  deleteModel: async (id: string) => {
    try {
      await invoke('delete_model', { id });
      await get().fetchModels();
      // 如果删除的是当前选中的模型，重置选择
      if (get().selectedModelId === id) {
        const models = get().models;
        set({ selectedModelId: models.length > 0 ? models[0].id : null });
      }
    } catch (e) {
      console.error('删除模型失败:', e);
    }
  },

  setSelectedModel: (id) => set({ selectedModelId: id }),
  setEdgeState: (state) => set({ edgeState: state }),
  setDockSide: (side) => set({ dockSide: side }),
  setDragging: (dragging) => set({ dragging }),
  setChildWindowOpen: (open) => set({ childWindowOpen: open }),
  setPollStatus: (id, status) =>
    set(s => ({ pollStatus: { ...s.pollStatus, [id]: status } })),

  // 历史查询 Actions
  setQueryDimension: (dimension) => {
    set({ queryDimension: dimension, queryFilter: null });
    // 自动刷新数据
    get().fetchDailyDetail();
    get().fetchDailyRecords();
  },

  setQueryFilter: (filter) => {
    set({ queryFilter: filter });
    // 自动刷新数据
    get().fetchDailyDetail();
    get().fetchDailyRecords();
  },

  setSelectedDate: (date) => {
    set({ selectedDate: date });
    // 自动刷新数据
    get().fetchDailyDetail();
    get().fetchDailyRecords();
  },

  setShowIgnored: (show) => {
    set({ showIgnored: show });
    get().fetchDailyRecords();
  },

  fetchDailyDetail: async () => {
    const { queryDimension, queryFilter, selectedDate } = get();
    try {
      const detail = await invoke<DailyDetail>('query_usage_detail', {
        params: {
          dimension: queryDimension,
          filter: queryFilter,
          date: selectedDate,
        },
      });
      set({ dailyDetail: detail });
    } catch (e) {
      console.error('获取每日详情失败:', e);
      set({ dailyDetail: null });
    }
  },

  fetchDailyCosts: async (days: number) => {
    const { queryDimension, queryFilter } = get();
    try {
      const costs = await invoke<DailyCost[]>('get_daily_costs', {
        dimension: queryDimension,
        filter: queryFilter,
        days,
      });
      set({ dailyCosts: costs });
    } catch (e) {
      console.error('获取每日花费失败:', e);
    }
  },

  fetchApiKeyList: async () => {
    try {
      const list = await invoke<ApiKeyInfo[]>('get_api_key_list');
      set({ apiKeyList: list });
    } catch (e) {
      console.error('获取API Key列表失败:', e);
    }
  },

  fetchDailyRecords: async () => {
    const { queryDimension, queryFilter, selectedDate, showIgnored } = get();
    try {
      const records = await invoke<RecordItem[]>('get_daily_records', {
        dimension: queryDimension,
        filter: queryFilter,
        date: selectedDate,
        showIgnored,
      });
      set({ dailyRecords: records });
    } catch (e) {
      console.error('获取每日记录失败:', e);
    }
  },

  ignoreRecord: async (recordId: number) => {
    try {
      await invoke('ignore_record', { recordId });
      // 刷新数据
      get().fetchDailyDetail();
      get().fetchDailyRecords();
    } catch (e) {
      console.error('忽略记录失败:', e);
    }
  },

  unignoreRecord: async (recordId: number) => {
    try {
      await invoke('unignore_record', { recordId });
      // 刷新数据
      get().fetchDailyDetail();
      get().fetchDailyRecords();
    } catch (e) {
      console.error('取消忽略失败:', e);
    }
  },
}));
