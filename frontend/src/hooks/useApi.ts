import { useEffect, useState } from 'react';

export default function useApi<T>(fetcher: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    fetcher()
      .then((res) => setData(res))
      .catch(setError)
      .finally(() => setLoading(false));
  }, [fetcher]);

  return { data, loading, error };
}
