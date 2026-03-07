import { useState, useEffect } from 'react';
import { locationApi, storeApi } from '../services/api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Button } from './ui/button';
import { RefreshCw, Filter, X, Store } from 'lucide-react';

export const FilterBar = ({ 
  onFilterChange, 
  onRefresh, 
  refreshInterval, 
  onIntervalChange,
  showRefresh = true,
  showStoreFilter = false
}) => {
  const [regions, setRegions] = useState([]);
  const [cities, setCities] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [stores, setStores] = useState([]);
  const [selectedRegion, setSelectedRegion] = useState('all');
  const [selectedCity, setSelectedCity] = useState('all');
  const [selectedDistrict, setSelectedDistrict] = useState('all');
  const [selectedStore, setSelectedStore] = useState('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    loadRegions();
    if (showStoreFilter) {
      loadStores();
    }
  }, [showStoreFilter]);

  useEffect(() => {
    if (selectedRegion && selectedRegion !== 'all') {
      loadCities(selectedRegion);
      if (showStoreFilter) loadStoresByLocation();
    } else {
      setCities([]);
      setSelectedCity('all');
      if (showStoreFilter) loadStores();
    }
  }, [selectedRegion]);

  useEffect(() => {
    if (selectedCity && selectedCity !== 'all') {
      loadDistricts(selectedCity);
      if (showStoreFilter) loadStoresByLocation();
    } else {
      setDistricts([]);
      setSelectedDistrict('all');
    }
  }, [selectedCity]);

  useEffect(() => {
    if (selectedDistrict && selectedDistrict !== 'all') {
      if (showStoreFilter) loadStoresByLocation();
    }
  }, [selectedDistrict]);

  useEffect(() => {
    onFilterChange?.({
      region_id: selectedRegion !== 'all' ? selectedRegion : null,
      city_id: selectedCity !== 'all' ? selectedCity : null,
      district_id: selectedDistrict !== 'all' ? selectedDistrict : null,
      store_ids: selectedStore !== 'all' ? selectedStore : null,
    });
  }, [selectedRegion, selectedCity, selectedDistrict, selectedStore, onFilterChange]);

  const loadRegions = async () => {
    try {
      const res = await locationApi.getRegions();
      setRegions(res.data);
    } catch (e) {
      console.error('Failed to load regions', e);
    }
  };

  const loadCities = async (regionId) => {
    try {
      const res = await locationApi.getCities(regionId);
      setCities(res.data);
    } catch (e) {
      console.error('Failed to load cities', e);
    }
  };

  const loadDistricts = async (cityId) => {
    try {
      const res = await locationApi.getDistricts(cityId);
      setDistricts(res.data);
    } catch (e) {
      console.error('Failed to load districts', e);
    }
  };

  const loadStores = async () => {
    try {
      const res = await storeApi.getAll();
      setStores(res.data);
    } catch (e) {
      console.error('Failed to load stores', e);
    }
  };

  const loadStoresByLocation = async () => {
    try {
      const params = {};
      if (selectedDistrict !== 'all') params.district_id = selectedDistrict;
      else if (selectedCity !== 'all') params.city_id = selectedCity;
      else if (selectedRegion !== 'all') params.region_id = selectedRegion;
      
      const res = await storeApi.getAll(params);
      setStores(res.data);
      // Reset store selection if current store is not in filtered list
      if (selectedStore !== 'all') {
        const storeExists = res.data.some(s => s.id === selectedStore);
        if (!storeExists) setSelectedStore('all');
      }
    } catch (e) {
      console.error('Failed to load stores', e);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await onRefresh?.();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const clearFilters = () => {
    setSelectedRegion('all');
    setSelectedCity('all');
    setSelectedDistrict('all');
    setSelectedStore('all');
    if (showStoreFilter) loadStores();
  };

  const hasActiveFilters = selectedRegion !== 'all' || selectedCity !== 'all' || selectedDistrict !== 'all' || selectedStore !== 'all';

  return (
    <div className="filter-bar" data-testid="filter-bar">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Filter className="w-4 h-4" />
        <span>Filtreler</span>
      </div>

      <Select value={selectedRegion} onValueChange={setSelectedRegion}>
        <SelectTrigger className="w-40 bg-secondary/50 border-white/10" data-testid="filter-region">
          <SelectValue placeholder="Bolge" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tum Bolgeler</SelectItem>
          {regions.map((r) => (
            <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={selectedCity} onValueChange={setSelectedCity} disabled={!cities.length}>
        <SelectTrigger className="w-40 bg-secondary/50 border-white/10" data-testid="filter-city">
          <SelectValue placeholder="Il" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tum Iller</SelectItem>
          {cities.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={selectedDistrict} onValueChange={setSelectedDistrict} disabled={!districts.length}>
        <SelectTrigger className="w-40 bg-secondary/50 border-white/10" data-testid="filter-district">
          <SelectValue placeholder="Ilce" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tum Ilceler</SelectItem>
          {districts.map((d) => (
            <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {showStoreFilter && (
        <Select value={selectedStore} onValueChange={setSelectedStore}>
          <SelectTrigger className="w-48 bg-secondary/50 border-white/10" data-testid="filter-store">
            <Store className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Mağaza" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm Mağazalar</SelectItem>
            {stores.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {hasActiveFilters && (
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={clearFilters}
          className="text-muted-foreground hover:text-foreground"
          data-testid="clear-filters"
        >
          <X className="w-4 h-4 mr-1" />
          Temizle
        </Button>
      )}

      <div className="flex-1" />

      {showRefresh && (
        <>
          <Select value={String(refreshInterval)} onValueChange={(v) => onIntervalChange?.(Number(v))}>
            <SelectTrigger className="w-32 bg-secondary/50 border-white/10" data-testid="refresh-interval">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5">5 saniye</SelectItem>
              <SelectItem value="10">10 saniye</SelectItem>
              <SelectItem value="30">30 saniye</SelectItem>
              <SelectItem value="60">1 dakika</SelectItem>
              <SelectItem value="0">Manuel</SelectItem>
            </SelectContent>
          </Select>

          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            className="border-white/10"
            data-testid="refresh-button"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Yenile
          </Button>
        </>
      )}
    </div>
  );
};

export default FilterBar;
