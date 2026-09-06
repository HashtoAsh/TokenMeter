import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/tauri';
import type { ModelConfig, DailyStats, EdgeState } from '../types';

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
  // 是否显示添加模型弹窗
  showAddModel: boolean;
  // 是否显示详情面板
  showDetail: boolean;

  // Actions
  fetchModels: () => Promise<void>;
  fetchAllStats: () => Promise<void>;
  addModel: (model: ModelConfig) => Promise<void>;
  updateModel: (model: ModelConfig) => Promise<void>;
  deleteModel: (id: string) => Promise<void>;
  setSelectedModel: (id: string | null) => void;
  setEdgeState: (state: EdgeState) => void;
  setShowAddModel: (show: boolean) => void;
  setShowDetail: (show: boolean) => void;
  setPollStatus: (id: string, status: { ok: boolean; error?: string }) => void;
}

export const useStore = create<AppState>((set, get) => ({
  models: [],
  stats: {},
  pollStatus: {},
  selectedModelId: null,
  edgeState: 'docked',
  showAddModel: false,
  showDetail: false,

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

  addModel: async (model: ModelConfig) => {
    try {
      await invoke('add_model', { model });
      await get().fetchModels();
      set({ showAddModel: false });
    } catch (e) {
      console.error('添加模型失败:', e);
      throw e;
    }
  },

  updateModel: async (model: ModelConfig) => {
    try {
      await invoke('update_model', { model });
      await get().fetchModels();
    } catch (e) {
      console.error('更新模型失败:', e);
      throw e;
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
  setShowAddModel: (show) => set({ showAddModel: show }),
  setShowDetail: (show) => set({ showDetail: show }),
  setPollStatus: (id, status) =>
    set(s => ({ pollStatus: { ...s.pollStatus, [id]: status } })),
}));
