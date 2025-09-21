// app/lib/activeGroup.js
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "padelsync.active_group_id";

const Ctx = createContext({
  activeGroup: null,         // { id, name } | null
  setActiveGroup: (_g) => {},// _g peut être null ou { id, name }
  loading: true,
});

export function ActiveGroupProvider({ children }) {
  const [activeGroup, setActiveGroupState] = useState(null);
  const [loading, setLoading] = useState(true);

  // charge depuis AsyncStorage au démarrage
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (mounted) setActiveGroupState(parsed);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const setActiveGroup = useCallback(async (g) => {
    // g: null ou { id, name }
    setActiveGroupState(g);
    try {
      if (g) await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ id: g.id, name: g.name ?? "" }));
      else await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  const value = useMemo(() => ({ activeGroup, setActiveGroup, loading }), [activeGroup, setActiveGroup, loading]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useActiveGroup() {
  return useContext(Ctx);
}