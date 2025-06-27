import { useEffect, useState } from 'react';
import apiClient from '../lib/apiClient';

interface Ad {
  id: string;
  title: string;
}

export default function HomePage() {
  const [ads, setAds] = useState<Ad[]>([]);

  useEffect(() => {
    apiClient.get('/ads').then(res => setAds(res.data)).catch(console.error);
  }, []);

  return (
    <div>
      <h1>Home Page</h1>
      <ul>
        {ads.map(ad => (
          <li key={ad.id}>{ad.title}</li>
        ))}
      </ul>
    </div>
  );
}
