import { useEffect, useRef, useState } from "react";

/**
 * Drop-in replacement for useState that persists to sessionStorage.
 * Survives mobile PWA backgrounding / process kill / window switch within
 * the same tab. Cleared by the browser when the tab closes.
 *
 * IMPORTANT: never clear automatically on visibility change or blur.
 * Callers explicitly clear via the returned `clear` function on
 * save / cancel / new-session.
 */
export function useSessionStorageState<T>(
  key: string,
  initial: T,
): [T, React.Dispatch<React.SetStateAction<T>>, () => void] {
  const initialRef = useRef(initial);

  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initialRef.current;
    try {
      const raw = sessionStorage.getItem(key);
      if (raw === null) return initialRef.current;
      return JSON.parse(raw) as T;
    } catch {
      return initialRef.current;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* quota / serialization — silent */
    }
  }, [key, value]);

  const clear = () => {
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* noop */
    }
    setValue(initialRef.current);
  };

  return [value, setValue, clear];
}
