import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "./supabase";

const ActiveGroupContext = createContext({
  activeGroup: null,
  setActiveGroup: () => {},
});

export function ActiveGroupProvider({ children }) {
  const [activeGroup, _setActiveGroup] = useState(null);

  const setActiveGroup = useCallback(async (g) => {
    _setActiveGroup(g);
    try {
      if (g?.id) {
        await AsyncStorage.setItem("active_group_id", String(g.id));
      } else {
        await AsyncStorage.removeItem("active_group_id");
      }
    } catch (e) {
      console.warn("[ActiveGroupProvider] persist setActiveGroup failed:", e?.message || e);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const savedId = await AsyncStorage.getItem("active_group_id");
        if (savedId) {
          const { data, error } = await supabase
            .from("groups")
            .select("id, name, avatar_url, visibility, join_policy")
            .eq("id", savedId)
            .maybeSingle();
          if (!error && data) _setActiveGroup(data);
        }
      } catch (err) {
        console.warn("[ActiveGroupProvider] preload failed:", err?.message || err);
      }
    })();
  }, []);

  return (
    <ActiveGroupContext.Provider value={{ activeGroup, setActiveGroup }}>
      {children}
    </ActiveGroupContext.Provider>
  );
}

export const useActiveGroup = () => useContext(ActiveGroupContext);
