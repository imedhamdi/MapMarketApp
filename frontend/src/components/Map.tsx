import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { Ad } from '../types';
import 'leaflet/dist/leaflet.css';

interface Props {
  ads: Ad[];
}

export default function Map({ ads }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (mapRef.current && !mapInstanceRef.current) {
      mapInstanceRef.current = L.map(mapRef.current).setView([48.8566, 2.3522], 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(mapInstanceRef.current);
    }
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    ads.forEach((ad) => {
      if (ad.location) {
        L.marker([ad.location.coordinates[1], ad.location.coordinates[0]]).addTo(map);
      }
    });
  }, [ads]);

  return <div ref={mapRef} style={{ height: '400px' }} />;
}
