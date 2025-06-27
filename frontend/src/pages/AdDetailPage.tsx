import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import apiClient from '../lib/apiClient';

export default function AdDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [ad, setAd] = useState<any>(null);

  useEffect(() => {
    if (id) {
      apiClient.get(`/ads/${id}`).then(res => setAd(res.data));
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
