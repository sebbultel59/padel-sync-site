import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { validateActiveGroup } from "./groupValidation";
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
          // Récupérer l'ID de l'utilisateur
          const { data: userData } = await supabase.auth.getUser();
          const userId = userData?.user?.id;

          if (!userId) {
            // Pas d'utilisateur connecté, nettoyer
            await AsyncStorage.removeItem("active_group_id");
            return;
          }

          // Vérifier que le groupe existe et que l'utilisateur est membre
          const isValid = await validateActiveGroup(userId, savedId);

          if (isValid) {
            // Groupe valide, charger les données
            const { data, error } = await supabase
              .from("groups")
              .select("id, name, avatar_url, visibility, join_policy")
              .eq("id", savedId)
              .maybeSingle();
            if (!error && data) {
              _setActiveGroup(data);
            } else {
              // Erreur lors du chargement, nettoyer
              await AsyncStorage.removeItem("active_group_id");
            }
          } else {
            // Groupe invalide (n'existe plus ou utilisateur n'est plus membre)
            console.log("[ActiveGroupProvider] Invalid group, cleaning up:", savedId);
            await AsyncStorage.removeItem("active_group_id");
            _setActiveGroup(null);

            // Nettoyer aussi dans le profil
            try {
              await supabase
                .from("profiles")
                .update({ active_group_id: null })
                .eq("id", userId);
            } catch (e) {
              console.warn("[ActiveGroupProvider] Error cleaning profile:", e);
            }
          }
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
