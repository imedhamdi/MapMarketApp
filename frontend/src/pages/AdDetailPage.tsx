import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getAdById } from '../services/apiClient';
import type { Ad } from '../types';

export default function AdDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [ad, setAd] = useState<Ad | null>(null);

  useEffect(() => {
    if (id) {
      getAdById(id).then(setAd);
    }
  }, [id]);

  if (!ad) return <div>Loading...</div>;

  return (
    <div>
      <h1>{ad.title}</h1>
      <p>{ad.description}</p>
    </div>
  );
}
