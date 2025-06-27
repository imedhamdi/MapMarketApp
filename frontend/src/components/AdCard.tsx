import styles from './AdCard.module.css';
import type { Ad } from '../types';
import { Link } from 'react-router-dom';

interface Props {
  ad: Ad;
}

export default function AdCard({ ad }: Props) {
  return (
    <div className={styles.card}>
      {ad.imageUrls?.[0] && (
        <img src={ad.imageUrls[0]} alt={ad.title} className={styles.image} />
      )}
      <h3 className={styles.title}>{ad.title}</h3>
      <p className={styles.price}>{ad.price ? `${ad.price}€` : ''}</p>
      <Link to={`/ad/${ad.id}`}>Voir l'annonce</Link>
    </div>
  );
}
