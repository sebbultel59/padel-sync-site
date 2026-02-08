import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { validateActiveGroup } from "./groupValidation";
import { supabase } from "./supabase";

const ActiveGroupContext = createContext({
  activeGroup: null,
  setActiveGroup: () => {},
});

const normalizeGroupName = (name) =>
  (name || "")
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

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

  const loadActiveGroup = useCallback(async () => {
    try {
      const savedId = await AsyncStorage.getItem("active_group_id");
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;

      if (!userId) {
        if (savedId) {
          await AsyncStorage.removeItem("active_group_id");
        }
        _setActiveGroup(null);
        return;
      }

      if (savedId) {
        const isValid = await validateActiveGroup(userId, savedId);
        if (isValid) {
          const { data, error } = await supabase
            .from("groups")
            .select("id, name, avatar_url, visibility, join_policy, club_id")
            .eq("id", savedId)
            .maybeSingle();
          if (!error && data) {
            _setActiveGroup(data);
            return;
          }
          await AsyncStorage.removeItem("active_group_id");
        } else {
          console.log("[ActiveGroupProvider] Invalid group, cleaning up:", savedId);
          await AsyncStorage.removeItem("active_group_id");
          _setActiveGroup(null);
        }
      }

      // Aucun groupe actif sauvegardé -> choisir "Padel Sync - France" par défaut
      const { data: myMemberships, error: eMemb } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("user_id", userId);
      if (eMemb) throw eMemb;
      const myIds = [...new Set((myMemberships ?? []).map((r) => r.group_id))];
      if (!myIds.length) {
        _setActiveGroup(null);
        return;
      }

      const { data: groups, error: gErr } = await supabase
        .from("groups")
        .select("id, name, avatar_url, visibility, join_policy, club_id")
        .in("id", myIds);
      if (gErr) throw gErr;

      const france = (groups || []).find(
        (g) => normalizeGroupName(g.name) === "padel sync - france"
      );
      const picked = france || groups?.[0] || null;
      if (picked) {
        _setActiveGroup(picked);
        await AsyncStorage.setItem("active_group_id", String(picked.id));
      } else {
        _setActiveGroup(null);
      }
    } catch (err) {
      console.warn("[ActiveGroupProvider] preload failed:", err?.message || err);
    }
  }, []);

  useEffect(() => {
    loadActiveGroup();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        _setActiveGroup(null);
        AsyncStorage.removeItem("active_group_id");
        return;
      }
      loadActiveGroup();
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, [loadActiveGroup]);

  return (
    <ActiveGroupContext.Provider value={{ activeGroup, setActiveGroup }}>
      {children}
    </ActiveGroupContext.Provider>
  );
}

export const useActiveGroup = () => useContext(ActiveGroupContext);
