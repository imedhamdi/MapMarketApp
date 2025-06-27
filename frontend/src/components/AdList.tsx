import AdCard from './AdCard';
import type { Ad } from '../types';
import styles from './AdList.module.css';

interface Props {
  ads: Ad[];
}

export default function AdList({ ads }: Props) {
  return (
    <div className={styles.list}>
      {ads.map((ad) => (
        <AdCard key={ad.id} ad={ad} />
      ))}
    </div>
  );
}
