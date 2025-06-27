import { useEffect, useState } from 'react';
import { getAds } from '../services/apiClient';
import Map from '../components/Map';
import AdList from '../components/AdList';
import Filters from '../components/Filters';
import type { Ad } from '../types';

export default function HomePage() {
  const [ads, setAds] = useState<Ad[]>([]);

  const [filters, setFilters] = useState<Record<string, unknown>>({});

  useEffect(() => {
    getAds(filters).then(setAds).catch(console.error);
  }, [filters]);

  return (
    <div>
      <h1>Home Page</h1>
      <Filters onChange={setFilters} />
      <Map ads={ads} />
      <AdList ads={ads} />
    </div>
  );
}
