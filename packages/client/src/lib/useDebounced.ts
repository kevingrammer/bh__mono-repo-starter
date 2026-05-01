import { useEffect, useState } from 'react';

/**
 * Returns the value after it has been stable for `delay` ms. Used to throttle
 * the global search input so we don't slam the server on every keystroke.
 */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
