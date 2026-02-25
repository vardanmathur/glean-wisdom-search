import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface SavedHighlightsContextType {
  savedIds: string[];
  toggleSave: (id: string) => void;
  isSaved: (id: string) => boolean;
}

const SavedHighlightsContext = createContext<SavedHighlightsContextType>({
  savedIds: [],
  toggleSave: () => {},
  isSaved: () => false,
});

export const useSavedHighlights = () => useContext(SavedHighlightsContext);

export const SavedHighlightsProvider = ({ children }: { children: ReactNode }) => {
  const [savedIds, setSavedIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("glean-saved") || "[]");
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem("glean-saved", JSON.stringify(savedIds));
  }, [savedIds]);

  const toggleSave = (id: string) => {
    setSavedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const isSaved = (id: string) => savedIds.includes(id);

  return (
    <SavedHighlightsContext.Provider value={{ savedIds, toggleSave, isSaved }}>
      {children}
    </SavedHighlightsContext.Provider>
  );
};
