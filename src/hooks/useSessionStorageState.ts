import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Drop-in replacement for useState that persists to sessionStorage.
 * Survives mobile PWA backgrounding / process kill / window switch within
 * the same tab. Cleared by the browser when the tab closes.
 *
 * IMPORTANT: never clear automatically on visibility change or blur.
 * Callers explicitly clear via the returned `clear` function on
 * save / cancel / new-session.
 *
 * Persistence is SYNCHRONOUS inside the setter (not deferred to useEffect)
 * so that fast window switches / mobile PWA backgrounding can never lose
 * the latest keystroke between a state update and an effect flush.
 */
export function useSessionStorageState<T>(
  key: string,
  initial: T,
): [T, React.Dispatch<React.SetStateAction<T>>, () => void] {
  const initialRef = useRef(initial);
  const keyRef = useRef(key);

  // Keep keyRef in sync if the key ever changes (e.g. id-derived keys).
  useEffect(() => {
    keyRef.current = key;
  }, [key]);

  const [value, setValueState] = useState<T>(() => {
    if (typeof window === "undefined") return initialRef.current;
    try {
      const raw = sessionStorage.getItem(key);
      if (raw === null) return initialRef.current;
      return JSON.parse(raw) as T;
    } catch {
      return initialRef.current;
    }
  });

  // Always mirror the latest value to sessionStorage. The synchronous write
  // in setValue handles the hot path; this effect covers the very first
  // mount (initial value seeding) and any key changes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* quota / serialization — silent */
    }
  }, [key, value]);

  const setValue: React.Dispatch<React.SetStateAction<T>> = useCallback((update) => {
    setValueState((prev) => {
      const next =
        typeof update === "function"
          ? (update as (p: T) => T)(prev)
          : update;
      if (typeof window !== "undefined") {
        try {
          sessionStorage.setItem(keyRef.current, JSON.stringify(next));
        } catch {
          /* quota / serialization — silent */
        }
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    if (typeof window !== "undefined") {
      try {
        sessionStorage.removeItem(keyRef.current);
      } catch {
        /* noop */
      }
    }
    setValueState(initialRef.current);
  }, []);

  return [value, setValue, clear];
}
