/**
 * useHeatmapData Hook
 * Manages heatmap data loading and state
 */
import { useState, useCallback } from 'react';
import { heatmapApi } from '../services/api';
import { toast } from 'sonner';

export const useHeatmapData = () => {
  const [loading, setLoading] = useState(false);
  const [heatmapData, setHeatmapData] = useState(null);
  const [storesWithFloors, setStoresWithFloors] = useState([]);
  const [selectedStore, setSelectedStore] = useState(null);
  const [selectedFloor, setSelectedFloor] = useState(null);

  // Load stores with floors
  const loadStoresWithFloors = useCallback(async () => {
    try {
      const res = await heatmapApi.getStoresWithFloors();
      setStoresWithFloors(res.data || []);
    } catch (e) {
      console.error('Failed to load stores', e);
      toast.error('Mağazalar yüklenemedi');
    }
  }, []);

  // Load heatmap data for a floor
  const loadHeatmapData = useCallback(async (floorId) => {
    if (!floorId) return;
    
    setLoading(true);
    try {
      const res = await heatmapApi.getLive(floorId);
      setHeatmapData(res.data);
    } catch (e) {
      console.error('Failed to load heatmap data', e);
      toast.error('Isı haritası verisi yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load historical data for simulation
  const loadHistoricalData = useCallback(async (floorId, storeId, dateFrom, dateTo) => {
    if (!floorId || !storeId) return null;
    
    setLoading(true);
    try {
      const res = await heatmapApi.getRange(floorId, storeId, dateFrom, dateTo);
      return res.data;
    } catch (e) {
      console.error('Failed to load historical data', e);
      toast.error('Geçmiş veriler yüklenemedi');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Load comparison data
  const loadCompareData = useCallback(async (floorId, storeId, date1From, date1To, date2From, date2To) => {
    if (!floorId || !storeId) return null;
    
    setLoading(true);
    try {
      const [todayRes, compareRes] = await Promise.all([
        heatmapApi.getRange(floorId, storeId, date1From, date1To),
        heatmapApi.getRange(floorId, storeId, date2From, date2To)
      ]);
      return {
        today: todayRes.data,
        compare: compareRes.data
      };
    } catch (e) {
      console.error('Failed to load compare data', e);
      toast.error('Karşılaştırma verisi yüklenemedi');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh current data
  const refreshData = useCallback(async () => {
    if (selectedFloor) {
      await loadHeatmapData(selectedFloor.floor_id);
      toast.success('Veriler yenilendi');
    }
  }, [selectedFloor, loadHeatmapData]);

  // Handle store selection
  const handleStoreSelect = useCallback((storeId) => {
    setSelectedStore(selectedStore === storeId ? null : storeId);
    setSelectedFloor(null);
    setHeatmapData(null);
  }, [selectedStore]);

  // Handle floor selection
  const handleFloorSelect = useCallback((floor) => {
    setSelectedFloor(floor);
    loadHeatmapData(floor.floor_id);
  }, [loadHeatmapData]);

  return {
    loading,
    setLoading,
    heatmapData,
    setHeatmapData,
    storesWithFloors,
    selectedStore,
    setSelectedStore,
    selectedFloor,
    setSelectedFloor,
    loadStoresWithFloors,
    loadHeatmapData,
    loadHistoricalData,
    loadCompareData,
    refreshData,
    handleStoreSelect,
    handleFloorSelect
  };
};

export default useHeatmapData;
