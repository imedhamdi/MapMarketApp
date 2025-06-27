import { useState } from 'react';
import styles from './Filters.module.css';

interface Props {
  onChange: (filters: Record<string, unknown>) => void;
}

export default function Filters({ onChange }: Props) {
  const [query, setQuery] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onChange({ q: query });
  };

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Rechercher"
      />
      <button type="submit">Filtrer</button>
    </form>
  );
}
