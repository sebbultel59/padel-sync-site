export default function MatchesScreen() {
useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setMeId(data?.user?.id ?? null);
    })();
  }, [groupId]);

  // Realtime: mise à jour fine sur INSERT/UPDATE/DELETE de matches (sans full refetch)
  useEffect(() => {
    if (!groupId) return;
    const ch = supabase
      .channel(`matches:${groupId}`)
      .on(
        "postgres_changes",
        { event: '*', schema: 'public', table: 'matches', filter: `group_id=eq.${groupId}` },
        (payload) => {
          const ev = String(payload?.eventType || '').toUpperCase();
          const rowNew = payload?.new || null;
          const rowOld = payload?.old || null;
          const row = rowNew || rowOld;
          console.log('[Realtime MATCH]', ev, row);
          if (!row) return;
          const matchId = String(rowNew?.id ?? rowOld?.id ?? '');
          if (!matchId) return;
          const status = String(rowNew?.status ?? rowOld?.status ?? '').toLowerCase();
          const time_slot_id = rowNew?.time_slot_id ?? rowOld?.time_slot_id ?? null;

          const removeFrom = (setter, id) => setter((prev = []) => prev.filter((x) => String(x.id) !== String(id)));
          const upsertInto = (setter, m) => setter((prev = []) => {
            const map = new Map(prev.map((x) => [String(x.id), x]));
            map.set(String(m.id), m);
            const arr = Array.from(map.values());
            arr.sort((a, b) => new Date(a?.time_slots?.starts_at || 0) - new Date(b?.time_slots?.starts_at || 0));
            return arr;
          });

          const ensureTimeSlot = async (m) => {
            if (m?.time_slots?.starts_at && m?.time_slots?.ends_at) return m;
            if (!time_slot_id) return m;
            const { data: ts } = await supabase
              .from('time_slots')
              .select('id, starts_at, ends_at')
              .eq('id', time_slot_id)
              .maybeSingle();
            if (ts) m.time_slots = { id: ts.id, starts_at: ts.starts_at, ends_at: ts.ends_at };
            return m;
          };

          (async () => {
            if (ev === 'DELETE') {
              removeFrom(setMatchesPending, matchId);
              removeFrom(setMatchesConfirmed, matchId);
              return;
            }

            let m = {
              id: matchId,
              group_id: groupId,
              status,
              time_slot_id,
              is_court_reserved: Boolean(rowNew?.is_court_reserved ?? rowOld?.is_court_reserved ?? false),
              court_reserved_at: rowNew?.court_reserved_at ?? rowOld?.court_reserved_at ?? null,
              court_reserved_by: rowNew?.court_reserved_by ?? rowOld?.court_reserved_by ?? null,
              time_slots: rowNew?.time_slots || rowOld?.time_slots || {},
            };
            m = await ensureTimeSlot(m);

            if (status === 'confirmed') {
              removeFrom(setMatchesPending, matchId);
              upsertInto(setMatchesConfirmed, m);
            } else if (status === 'open' || status === 'pending') {
              removeFrom(setMatchesConfirmed, matchId);
              upsertInto(setMatchesPending, m);
            } else {
              // autres statuts: retirer des deux listes
              removeFrom(setMatchesPending, matchId);
              removeFrom(setMatchesConfirmed, matchId);
            }
          })();
        }
      )
      .subscribe((status) => {
        console.log('[Realtime MATCH] channel status =', status);
      });

    return () => {
      supabase.removeChannel(ch);
    };
  }, [groupId]);

  // Realtime: fine-grained RSVP updates (optimistic, no full refetch)
  useEffect(() => {
    if (!groupId) return;
    const ch = supabase
      .channel(`match_rsvps:${groupId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "match_rsvps" },
        (payload) => {
          try {
            const ev = String(payload?.eventType || '').toUpperCase();
            const rowNew = payload?.new || null;
            const rowOld = payload?.old || null;
            const matchId = String((rowNew?.match_id ?? rowOld?.match_id) || '');
            const userId  = String((rowNew?.user_id  ?? rowOld?.user_id)  || '');

            if (!matchId || !userId) return;

            // Debug log for RSVP event
            console.log('[Realtime RSVP]', ev, { matchId, userId, new: rowNew, old: rowOld });

            setRsvpsByMatch((prev) => {
              const next = { ...prev };
              const arr = Array.isArray(next[matchId]) ? [...next[matchId]] : [];

              if (ev === 'INSERT' || ev === 'UPDATE') {
                const i = arr.findIndex((r) => String(r.user_id) === userId);
                const item = {
                  user_id: userId,
                  status: String(rowNew?.status || '').toLowerCase(),
                  created_at: rowNew?.created_at || arr[i]?.created_at || null,
                };
                if (i >= 0) arr[i] = { ...arr[i], ...item };
                else arr.push(item);
                next[matchId] = arr;
                return next;
              }

              if (ev === 'DELETE') {
                const i = arr.findIndex((r) => String(r.user_id) === userId);
                if (i >= 0) {
                  arr.splice(i, 1);
                  next[matchId] = arr;
                }
                return next;
              }

              return prev;
            });
          } catch (e) {
            // Fallback: if anything goes wrong, do a light refresh
            fetchData();
          }
        }
      )
      .subscribe((status) => {
        console.log('[Realtime RSVP] channel status =', status);
      });

    return () => {
      supabase.removeChannel(ch);
    };
  }, [groupId, fetchData]);

  // --- Flash Match helpers ---
  async function loadGroupMembersForFlash() {
    if (!groupId) return [];
    try {
      // Essai 1 : récupérer les membres avec jointure profiles si relation existante
      let { data, error } = await supabase
        .from('group_members')
        .select('user_id, profiles!inner(id, display_name, name)')
        .eq('group_id', groupId);

      // Si la jointure échoue (data vide ou erreur), fallback manuel
      if (error || !Array.isArray(data) || data.length === 0) {
        console.warn('[FlashMatch] fallback: pas de jointure profiles détectée');
        const { data: gm } = await supabase
          .from('group_members')
          .select('user_id')
          .eq('group_id', groupId);

        const ids = gm?.map(r => r.user_id).filter(Boolean) || [];

        if (ids.length === 0) return [];

        const { data: profs } = await supabase
          .from('profiles')
          .select('id, display_name, name')
          .in('id', ids);

        data = profs.map(p => ({
          user_id: p.id,
          profiles: { id: p.id, display_name: p.display_name, name: p.name },
        }));
      }

      // Normalisation
      const members = data
        .map(r => ({
          id: r?.profiles?.id || r?.user_id,
          name: r?.profiles?.display_name || r?.profiles?.name || 'Joueur inconnu',
        }))
        .filter(x => !!x.id);

      console.log(`[FlashMatch] ${members.length} membres chargés pour le groupe ${groupId}`);
      return members;
    } catch (e) {
      console.warn('[FlashMatch] load members failed:', e?.message || e);
      return [];
    }
  }

  function showMemberPickerIOS(candidates, already = []) {
    return new Promise((resolve) => {
      const remaining = candidates.filter(c => !already.includes(String(c.id)));
      const options = [...remaining.map(m => m.name), 'Annuler'];
      ActionSheetIOS.showActionSheetWithOptions(
        { title: 'Choisis un joueur (encore ' + (3 - already.length) + ')', options, cancelButtonIndex: options.length - 1 },
        (idx) => {
          if (idx === options.length - 1) return resolve(null);
          const picked = remaining[idx];
          resolve(picked?.id || null);
        }
      );
    });
  }

  async function openFlashMatchPicker() {
    try {
      setFlashLoading(true);
      const members = await loadGroupMembersForFlash();

      // Assure-toi d'avoir mon UID même si meId n'est pas encore peuplé
      let uid = meId;
      if (!uid) {
        try {
          const { data: u } = await supabase.auth.getUser();
          uid = u?.user?.id ?? null;
        } catch {}
      }

      // Exclure l'utilisateur authentifié de la liste proposée
      const ms = (members || []).filter(m => !uid || String(m.id) !== String(uid));

      setFlashMembers(ms);
      setFlashSelected([]);
      setFlashQuery("");
      // (Ré)initialiser les dates par défaut
      const now = new Date();
      const msRound = 30 * 60 * 1000;
      const rounded = new Date(Math.ceil(now.getTime() / msRound) * msRound);
      const defaultStart = new Date(rounded.getTime() + 30 * 60 * 1000);
      const defaultEnd = new Date(defaultStart.getTime() + 90 * 60 * 1000);
      setFlashStart(defaultStart);
      setFlashEnd(defaultEnd);
      setFlashPickerOpen(true); // 👉 Ouvre la modale universelle (iOS + Android)
    } catch (e) {
      Alert.alert('Erreur', e?.message || String(e));
    } finally {
      setFlashLoading(false);
    }
  }

  async function createFlashMatch(selectedUserIds) {
    // Par défaut: match dans 1h (démarre dans 15 min)
    const starts = new Date(Date.now() + 15 * 60 * 1000);
    const ends = new Date(starts.getTime() + 60 * 60 * 1000);
    const sIso = starts.toISOString();
    const eIso = ends.toISOString();

    // Crée un match sur l'intervalle en ignorant la dispo, et tag les 3 joueurs en RSVP pending
    await onCreateIntervalMatch(sIso, eIso, selectedUserIds);

    try {
      // Envoie des notifs via une table tampon (si elle existe)
      await supabase.from('notification_jobs').insert(
        selectedUserIds.map((uid) => ({
          kind: 'match_flash',
          recipients: [uid],
          payload: { title: 'Match Éclair ⚡️', message: "Un match rapide t’a été proposé !" },
          created_at: new Date().toISOString(),
        }))
      );
    } catch (e) {
      console.warn('[FlashMatch] notification insert failed:', e?.message || e);
    }

    Alert.alert('Match Éclair', 'Match créé et invitations envoyées.');
  }

  // --- Ajout : handler de confirmation du match éclair ---
  const onConfirmFlashMatch = React.useCallback(() => {
    if (flashSelected.length !== 3) {
      Alert.alert('Match éclair', 'Sélectionne exactement 3 joueurs.');
      return;
    }
    // Ouvre la modale de choix date/heure
    setFlashWhenOpen(true);
  }, [flashSelected]);

// Accepter en masse des joueurs sélectionnés sur un match donné
async function acceptPlayers(matchId, userIds = []) {
  const ids = Array.from(new Set((userIds || []).map(String)));
  if (!matchId || ids.length === 0) return;

  // Tentative via RPC (respect RLS)
  try {
    await Promise.all(
      ids.map((uid) =>
        supabase.rpc('admin_accept_player', { p_match: matchId, p_user: uid })
      )
    );
    return;
  } catch (e) {
    console.warn('[acceptPlayers] RPC failed, fallback to upsert:', e?.message || e);
  }

  // Fallback: upsert direct
  const rows = ids.map((uid) => ({ match_id: matchId, user_id: uid, status: 'accepted' }));
  const { error } = await supabase
    .from('match_rsvps')
    .upsert(rows, { onConflict: 'match_id,user_id' });
  if (error) console.warn('[acceptPlayers] upsert error:', error.message || error);
}

// Enregistrer des joueurs sélectionnés en 'maybe' (attente/remplaçants)
async function setPlayersMaybe(matchId, userIds = [], excludeUserId) {
  const ids = Array.from(new Set((userIds || []).map(String)))
    .filter((id) => id && id !== String(excludeUserId));
  if (!matchId || ids.length === 0) return;
  const rows = ids.map((uid) => ({ match_id: matchId, user_id: uid, status: 'maybe' }));
  const { error } = await supabase
    .from('match_rsvps')
    .upsert(rows, { onConflict: 'match_id,user_id' });
  if (error) console.warn('[setPlayersMaybe] upsert error:', error.message || error);
}

// Forcer tous les RSVP "accepted" (hors créateur) à repasser en "maybe"
async function demoteNonCreatorAcceptedToMaybe(matchId, creatorUserId) {
  if (!matchId) return;
  const creatorIdStr = creatorUserId ? String(creatorUserId) : null;
  try {
    const { data: rows, error } = await supabase
      .from('match_rsvps')
      .select('user_id, status')
      .eq('match_id', matchId);
    if (error) throw error;

    const toDemote = (rows || [])
      .filter((r) => String(r.user_id) !== creatorIdStr && String(r.status || '').toLowerCase() === 'accepted')
      .map((r) => String(r.user_id));

    if (!toDemote.length) return;

    const payload = toDemote.map((uid) => ({ match_id: matchId, user_id: uid, status: 'maybe' }));
    const { error: eUp } = await supabase
      .from('match_rsvps')
      .upsert(payload, { onConflict: 'match_id,user_id' });
    if (eUp) throw eUp;

    // Optimisme UI : mettre à jour localement
    setRsvpsByMatch((prev) => {
      const next = { ...prev };
      const arr = Array.isArray(next[matchId]) ? [...next[matchId]] : [];
      for (const uid of toDemote) {
        const i = arr.findIndex((r) => String(r.user_id) === String(uid));
        if (i >= 0) arr[i] = { ...arr[i], status: 'maybe' };
        else arr.push({ user_id: uid, status: 'maybe' });
      }
      next[matchId] = arr;
      return next;
    });
  } catch (e) {
    console.warn('[demoteNonCreatorAcceptedToMaybe] failed:', e?.message || e);
  }
}

  const onCreateMatch = useCallback(
    async (time_slot_id, selectedUserIds = []) => {
      if (!groupId) return;
      try {
        const { error } = await supabase.rpc("create_match_from_slot", {
          p_group: groupId,
          p_time_slot: time_slot_id,
        });
        if (error) throw error;
        // Auto-RSVP: inscrire automatiquement le créateur comme 'accepted'
        try {
          // récupérer l'ID du match fraîchement créé (par group_id + time_slot_id)
          const { data: createdMatch } = await supabase
            .from('matches')
            .select('id')
            .eq('group_id', groupId)
            .eq('time_slot_id', time_slot_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          // récupérer mon UID
          let uid = meId;
          if (!uid) {
            const { data: u } = await supabase.auth.getUser();
            uid = u?.user?.id ?? null;
          }

          if (createdMatch?.id && uid) {
            await supabase
              .from('match_rsvps')
              .upsert(
                { match_id: createdMatch.id, user_id: uid, status: 'accepted' },
                { onConflict: 'match_id,user_id' }
              );
            // mettre à jour l'UI localement (optimiste)
            setRsvpsByMatch((prev) => {
              const next = { ...prev };
              const arr = Array.isArray(next[createdMatch.id]) ? [...next[createdMatch.id]] : [];
              const i = arr.findIndex((r) => r.user_id === uid);
              if (i >= 0) arr[i] = { ...arr[i], status: 'accepted' };
              else arr.push({ user_id: uid, status: 'accepted' });
              next[createdMatch.id] = arr;
              return next;
            });
          }

          // Mettre les joueurs sélectionnés en attente (remplaçants)
          try {
            const toMaybe = (selectedUserIds || [])
              .map(String)
              .filter((id) => id && id !== String(uid));
            if (createdMatch?.id && toMaybe.length) {
              await setPlayersMaybe(createdMatch.id, toMaybe, uid);
              // Optimisme UI: marquer en 'maybe' localement
              setRsvpsByMatch((prev) => {
                const next = { ...prev };
                const arr = Array.isArray(next[createdMatch.id]) ? [...next[createdMatch.id]] : [];
                for (const id of toMaybe) {
                  const i = arr.findIndex((r) => String(r.user_id) === String(id));
                  if (i >= 0) arr[i] = { ...arr[i], status: 'maybe' };
                  else arr.push({ user_id: id, status: 'maybe' });
                }
                next[createdMatch.id] = arr;
                return next;
              });
            }
          } catch (e) {
            console.warn('[Matches] set selected users to maybe (slot) failed:', e?.message || e);
          }

          // Sécurité : si le backend a pré-accepté d'autres joueurs, on les remet en attente
          try {
            if (createdMatch?.id && uid) {
              await demoteNonCreatorAcceptedToMaybe(createdMatch.id, uid);
            }
          } catch {}

          // Seed default 'maybe' for other available players covering the slot
          try {
            if (createdMatch?.id) {
              const { data: slotRow } = await supabase
                .from('time_slots')
                .select('starts_at, ends_at')
                .eq('id', time_slot_id)
                .maybeSingle();
              if (slotRow?.starts_at && slotRow?.ends_at) {
                await seedMaybeRsvps({
                  matchId: createdMatch.id,
                  groupId,
                  startsAt: slotRow.starts_at,
                  endsAt: slotRow.ends_at,
                  excludeUserId: uid,
                });
              }
            }
          } catch (seedErr) {
            console.warn('[Matches] seedMaybeRsvps (slot) failed:', seedErr?.message || seedErr);
          }
        } catch (autoErr) {
          // on ne bloque pas la création si l'auto-RSVP échoue
          console.warn('[Matches] auto-RSVP failed:', autoErr?.message || autoErr);
        }
        await fetchData();
        if (Platform.OS === "web") {
          window.alert("Match créé 🎾\nLe créneau a été transformé en match.");
        } else {
          Alert.alert("Match créé 🎾", "Le créneau a été transformé en match.");
        }
      } catch (e) {
        if (Platform.OS === "web") {
          window.alert("Impossible de créer le match\n" + (e.message ?? String(e)));
        } else {
          Alert.alert("Impossible de créer le match", e.message ?? String(e));
        }
      }
    },
    [groupId, fetchData]
  );

  const onCreateIntervalMatch = useCallback(
    async (starts_at_iso, ends_at_iso, selectedUserIds = []) => {
      if (!groupId) return;
      try {
        // 1) Primary path: RPC returns the created match id (uuid) directly
        let newMatchId = null;
        let rpcErr = null;
        try {
          const { data, error } = await supabase.rpc('create_match_from_interval_safe', {
            p_group: groupId,
            p_starts_at: starts_at_iso,
            p_ends_at: ends_at_iso,
          });
          if (error) rpcErr = error; else newMatchId = data;
        } catch (e) {
          rpcErr = e;
        }

        // 1.b) Fallback for unique-constraint on time_slots (same group + same start)
        const isUniqueViolation = !!rpcErr && (
          rpcErr?.code === '23505' ||
          String(rpcErr?.message || rpcErr?.details || rpcErr?.hint || rpcErr).includes('duplicate key value') ||
          String(rpcErr?.message || rpcErr).includes('uniq_time_slots')
        );
        if (isUniqueViolation) {
          // Reuse the existing time_slot that starts at (or very close to) the same time for this group
          const starts = new Date(starts_at_iso);
          const FUZZ_MS = 5 * 60 * 1000; // ±5 minutes tolerance for existing start
          const lo = new Date(starts.getTime() - FUZZ_MS).toISOString();
          const hi = new Date(starts.getTime() + FUZZ_MS).toISOString();

          // Try exact match first
          let { data: slot, error: eSlot } = await supabase
            .from('time_slots')
            .select('id, starts_at, ends_at')
            .eq('group_id', groupId)
            .eq('starts_at', starts_at_iso)
            .maybeSingle();

          // If not found, try a fuzzy window ±5 minutes
          if (!slot) {
            const { data: slots2 } = await supabase
              .from('time_slots')
              .select('id, starts_at, ends_at')
              .eq('group_id', groupId)
              .gte('starts_at', lo)
              .lte('starts_at', hi)
              .limit(1);
            slot = Array.isArray(slots2) && slots2.length ? slots2[0] : null;
          }

          if (slot?.id) {
            // If a match already exists for that slot, just exit with a friendly message
            const { data: exist } = await supabase
              .from('matches')
              .select('id')
              .eq('group_id', groupId)
              .eq('time_slot_id', slot.id)
              .limit(1);
            if (Array.isArray(exist) && exist.length) {
              if (Platform.OS === 'web') window.alert('Ce créneau possède déjà un match associé.');
              else Alert.alert('Info', 'Ce créneau possède déjà un match associé.');
              await fetchData();
              return;
            }

            // Create the match by reusing the existing slot
            const { data: ins, error: eIns } = await supabase
              .from('matches')
              .insert({ group_id: groupId, time_slot_id: slot.id, status: 'open' })
              .select('id')
              .single();
            if (eIns) throw eIns;
            newMatchId = ins?.id || null;
            // Ensure ends_at we propagate below is coherent with the slot row
            if (slot?.starts_at && slot?.ends_at) {
              starts_at_iso = slot.starts_at;
              ends_at_iso = slot.ends_at || ends_at_iso;
            }
          } else {
            // If we cannot resolve the existing slot, rethrow the original error
            throw rpcErr;
          }
        } else if (rpcErr) {
          // Different error → rethrow
          throw rpcErr;
        }

        if (!newMatchId) {
          // Nothing created (likely <4 players). Give a clean message and exit.
          if (Platform.OS === 'web') {
            window.alert('Action impossible\nAucun match créé pour cet intervalle.');
          } else {
            Alert.alert('Action impossible', 'Aucun match créé pour cet intervalle.');
          }
          return;
        }

        // 2) Auto-RSVP: mark current user as 'accepted'
        let uid = meId;
        if (!uid) {
          const { data: u } = await supabase.auth.getUser();
          uid = u?.user?.id ?? null;
        }
        if (uid) {
          await supabase
            .from('match_rsvps')
            .upsert(
              { match_id: newMatchId, user_id: uid, status: 'accepted' },
              { onConflict: 'match_id,user_id' }
            );
          // Optimistic local state update
          setRsvpsByMatch((prev) => {
            const next = { ...prev };
            const arr = Array.isArray(next[newMatchId]) ? [...next[newMatchId]] : [];
            const i = arr.findIndex((r) => String(r.user_id) === String(uid));
            if (i >= 0) arr[i] = { ...arr[i], status: 'accepted' };
            else arr.push({ user_id: uid, status: 'accepted' });
            next[newMatchId] = arr;
            return next;
          });
        }

        // Mettre les joueurs sélectionnés en attente (remplaçants)
        try {
          const toMaybe = (selectedUserIds || [])
            .map(String)
            .filter((id) => id && id !== String(uid));
          if (newMatchId && toMaybe.length) {
            await setPlayersMaybe(newMatchId, toMaybe, uid);
            setRsvpsByMatch((prev) => {
              const next = { ...prev };
              const arr = Array.isArray(next[newMatchId]) ? [...next[newMatchId]] : [];
              for (const id of toMaybe) {
                const i = arr.findIndex((r) => String(r.user_id) === String(id));
                if (i >= 0) arr[i] = { ...arr[i], status: 'maybe' };
                else arr.push({ user_id: id, status: 'maybe' });
              }
              next[newMatchId] = arr;
              return next;
            });
          }
        } catch (e) {
          console.warn('[Matches] set selected users to maybe (interval) failed:', e?.message || e);
        }

        // Sécurité : si le backend a pré-accepté d'autres joueurs, on les remet en attente
        try {
          if (newMatchId && uid) {
            await demoteNonCreatorAcceptedToMaybe(newMatchId, uid);
          }
        } catch {}

        // 3) Seed default 'maybe' for other available players across the whole interval
        try {
          await seedMaybeRsvps({
            matchId: newMatchId,
            groupId,
            startsAt: starts_at_iso,
            endsAt: ends_at_iso,
            excludeUserId: uid,
          });
        } catch (seedErr) {
          console.warn('[Matches] seedMaybeRsvps (interval) failed:', seedErr?.message || seedErr);
        }

        // 4) Refresh lists and notify UX
        await fetchData();
        if (Platform.OS === 'web') {
          window.alert('Match créé 🎾\nLe créneau a été transformé en match.');
        } else {
          Alert.alert('Match créé 🎾', 'Le créneau a été transformé en match.');
        }
      } catch (e) {
        if (Platform.OS === 'web') {
          window.alert('Erreur\n' + (e.message ?? String(e)));
        } else {
          Alert.alert('Erreur', e.message ?? String(e));
        }
      }
    },
    [groupId, fetchData]
  );

  const onRsvpAccept = useCallback(async (match_id) => {
    try {
      // Resolve my user id reliably (avoid accessing .getUser() without await)
      let uid = meId;
      if (!uid) {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        uid = data?.user?.id ?? null;
      }
      if (!uid) throw new Error('Utilisateur non connecté');

      // Upsert RSVP as accepted (normalized)
      const { error: eUp } = await supabase
        .from('match_rsvps')
        .upsert(
          { match_id, user_id: uid, status: normalizeRsvp('accepted') },
          { onConflict: 'match_id,user_id' }
        );
      if (eUp) throw eUp;

      // Optimistic UI update: mark me as accepted locally (normalized)
      setRsvpsByMatch((prev) => {
        const next = { ...prev };
        const arr = Array.isArray(next[match_id]) ? [...next[match_id]] : [];
        const i = arr.findIndex((r) => r.user_id === uid);
        if (i >= 0) {
          arr[i] = { ...arr[i], status: normalizeRsvp('accepted') };
        } else {
          arr.push({ user_id: uid, status: normalizeRsvp('accepted') });
        }
        next[match_id] = arr;
        return next;
      });

      await fetchData();
      if (Platform.OS === 'web') {
        window.alert('Participation confirmée ✅');
      } else {
        Alert.alert('RSVP', 'Participation confirmée ✅');
      }
    } catch (e) {
      if (Platform.OS === 'web') {
        window.alert('Impossible de confirmer\n' + (e.message ?? String(e)));
      } else {
        Alert.alert('Impossible de confirmer', e.message ?? String(e));
      }
    }
  }, [meId, fetchData]);

  const onRsvpCancel = useCallback(async (match_id) => {
    try {
      // Resolve my user id correctly
      let uid = meId;
      if (!uid) {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        uid = data?.user?.id ?? null;
      }
      if (!uid) throw new Error('Utilisateur non connecté');

      // Set my RSVP to 'maybe' instead of deleting (more robust with RLS + simpler UI toggle)
      const { error: eUp } = await supabase
        .from('match_rsvps')
        .upsert(
          { match_id, user_id: uid, status: normalizeRsvp('maybe') },
          { onConflict: 'match_id,user_id' }
        );
      if (eUp) throw eUp;

      // Optimistic UI update: mark me as 'maybe' locally so the badge/button toggles immediately
      setRsvpsByMatch((prev) => {
        const next = { ...prev };
        const arr = Array.isArray(next[match_id]) ? [...next[match_id]] : [];
        const i = arr.findIndex((r) => String(r.user_id) === String(uid));
        if (i >= 0) {
          arr[i] = { ...arr[i], status: normalizeRsvp('maybe') };
        } else {
          arr.push({ user_id: uid, status: normalizeRsvp('maybe') });
        }
        next[match_id] = arr;
        return next;
      });

      await fetchData();
      if (Platform.OS === 'web') {
        window.alert('Participation annulée');
      } else {
        Alert.alert('RSVP', 'Participation annulée');
      }
    } catch (e) {
      if (Platform.OS === 'web') {
        window.alert('Impossible d\'annuler\n' + (e.message ?? String(e)));
      } else {
        Alert.alert('Impossible d\'annuler', e.message ?? String(e));
      }
    }
  }, [meId, fetchData]);

  const onRsvpDecline = useCallback(async (match_id) => {
    try {
      // Resolve my user id correctly
      let uid = meId;
      if (!uid) {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        uid = data?.user?.id ?? null;
      }
      if (!uid) throw new Error('Utilisateur non connecté');

      // Set my RSVP to 'no'
      const { error: eUp } = await supabase
        .from('match_rsvps')
        .upsert(
          { match_id, user_id: uid, status: normalizeRsvp('no') },
          { onConflict: 'match_id,user_id' }
        );
      if (eUp) throw eUp;

      // Optimistic UI update
      setRsvpsByMatch((prev) => {
        const next = { ...prev };
        const arr = Array.isArray(next[match_id]) ? [...next[match_id]] : [];
        const i = arr.findIndex((r) => String(r.user_id) === String(uid));
        if (i >= 0) {
          arr[i] = { ...arr[i], status: normalizeRsvp('no') };
        } else {
          arr.push({ user_id: uid, status: normalizeRsvp('no') });
        }
        next[match_id] = arr;
        return next;
      });

      await fetchData();
      if (Platform.OS === 'web') {
        window.alert('Participation refusée');
      } else {
        Alert.alert('RSVP', 'Participation refusée');
      }
    } catch (e) {
      if (Platform.OS === 'web') {
        window.alert('Impossible de refuser\n' + (e.message ?? String(e)));
      } else {
        Alert.alert('Impossible de refuser', e.message ?? String(e));
      }
    }
  }, [meId, fetchData]);

  const setCourtReservedLocal = React.useCallback((matchId, nextVal, when = null, who = null) => {    const apply = (arr) => arr.map((x) =>
      String(x.id) === String(matchId)
      ? { ...x, is_court_reserved: !!nextVal, court_reserved_at: when, court_reserved_by: who }
        : x
    );
    setMatchesConfirmed((prev = []) => apply(prev));
    setMatchesPending((prev = []) => apply(prev));
  }, []);
  
  const toggleCourtReservation = React.useCallback(async (matchId, currentVal) => {
    try {
      // 1) Resolve the user id FIRST (before any usage)
      let userId = meId;
      if (!userId) {
        const { data: u } = await supabase.auth.getUser();
        userId = u?.user?.id ?? null;
      }

      // 2) Compute next state and timestamp
      const nextVal = !currentVal;
      const when = nextVal ? new Date().toISOString() : null;

      // 3) Optimistic UI update (can safely reference userId now)
      setCourtReservedLocal(matchId, nextVal, when, nextVal ? userId : null);

      // 4) Persist to DB
      const { error } = await supabase
        .from('matches')
        .update({
          is_court_reserved: nextVal,
          court_reserved_at: when,
          court_reserved_by: nextVal ? userId : null,
        })
        .eq('id', matchId);
      if (error) throw error;
    } catch (e) {
      // Rollback on error
      setCourtReservedLocal(
        matchId,
        currentVal,
        currentVal ? new Date().toISOString() : null,
        null
      );
      if (Platform.OS === 'web') {
        window.alert(
          "Impossible de mettre à jour la réservation de terrain\n" +
            (e?.message ?? String(e))
        );
      } else {
        Alert.alert('Erreur', e?.message ?? String(e));
      }
    }
  }, [setCourtReservedLocal, meId]);

  // --- Annulation d'un match → retour en "propositions"
  const onCancelMatch = useCallback(async (match_id) => {
    if (!match_id) return;
    try {
      // 1) Essayer une RPC si disponible côté DB
      try {
        const { error: eRpc } = await supabase.rpc('cancel_match', { p_match: match_id });
        if (!eRpc) {
          await fetchData();
          if (Platform.OS === 'web') window.alert('Match annulé — le créneau revient dans les propositions.');
          else Alert.alert('Match annulé', 'Le créneau revient dans les propositions.');
          return;
        }
      } catch {}

      // 2) Fallback: supprimer RSVPs puis le match
      const { error: eR } = await supabase.from('match_rsvps').delete().eq('match_id', match_id);
      if (eR) console.warn('[onCancelMatch] delete RSVPs error:', eR.message || eR);

      const { error: eM } = await supabase.from('matches').delete().eq('id', match_id);
      if (eM) throw eM;

      await fetchData();
      if (Platform.OS === 'web') window.alert('Match annulé — le créneau revient dans les propositions.');
      else Alert.alert('Match annulé', 'Le créneau revient dans les propositions.');
    } catch (e) {
      if (Platform.OS === 'web') window.alert('Impossible d\'annuler le match\n' + (e.message ?? String(e)));
      else Alert.alert('Erreur', e.message ?? String(e));
    }
  }, [fetchData]);

  const onAdminAccept = useCallback(async (match_id, user_id) => {
    try {
      // try RPC first (secure path with RLS)
      const { error: eRpc } = await supabase.rpc('admin_accept_player', {
        p_match: match_id,
        p_user: user_id,
      });
      if (eRpc) {
        // fallback: direct upsert (works only if RLS permits)
        const { error: eUp } = await supabase
          .from('match_rsvps')
          .upsert(
            { match_id, user_id, status: normalizeRsvp('accepted') },
            { onConflict: 'match_id,user_id' }
          );
        if (eUp) throw eUp;
      }

      // Optimistic UI update
      setRsvpsByMatch((prev) => {
        const next = { ...prev };
        const arr = Array.isArray(next[match_id]) ? [...next[match_id]] : [];
        const i = arr.findIndex((r) => String(r.user_id) === String(user_id));
        if (i >= 0) {
          arr[i] = { ...arr[i], status: normalizeRsvp('accepted') };
        } else {
          arr.push({ user_id, status: normalizeRsvp('accepted') });
        }
        next[match_id] = arr;
        return next;
      });

      await fetchData();
      if (Platform.OS === 'web') {
        window.alert('Joueur ajouté au match');
      } else {
        Alert.alert('RSVP', 'Joueur ajouté au match');
      }
    } catch (e) {
      if (Platform.OS === 'web') {
        window.alert('Impossible d\'ajouter le joueur\n' + (e.message ?? String(e)));
      } else {
        Alert.alert('Erreur', e.message ?? String(e));
      }
    }
  }, [fetchData]);

  const onContactClub = useCallback(async () => {
  // Open player profile (tap) – falls back to showing name if route not available
  const openPlayerProfile = React.useCallback((uid, displayName) => {
    try {
      // Lazy import to avoid requiring router if not used elsewhere
      const { useRouter } = require('expo-router');
      const RouterConsumer = () => null;
    } catch {}
  }, []);
    if (!groupId) return;
    try {
      const { data } = await supabase.from("groups").select("phone").eq("id", groupId).maybeSingle();
      const phone = data?.phone;
      if (phone) {
        await Linking.openURL(`tel:${phone}`);
      } else {
        if (Platform.OS === "web") {
          window.alert("Pas de téléphone\nAucun numéro de club renseigné pour ce groupe.");
        } else {
          Alert.alert("Pas de téléphone", "Aucun numéro de club renseigné pour ce groupe.");
        }
      }
    } catch (e) {
      if (Platform.OS === "web") {
        window.alert("Erreur\n" + (e.message ?? String(e)));
      } else {
        Alert.alert("Erreur", e.message ?? String(e));
      }
    }
  }, [groupId]);

  const formatDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const WD = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const MO = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    const wd = WD[d.getDay()] || '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mo = MO[d.getMonth()] || '';
    const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return `${wd} ${dd} ${mo} • ${time}`;
  };

  const formatRange = (sIso, eIso) => {
    if (!sIso || !eIso) return '';
    const s = new Date(sIso);
    const e = new Date(eIso);

    const WD = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const MO = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

    const wd = WD[s.getDay()] || '';
    const dd = String(s.getDate()).padStart(2, '0');
    const mo = MO[s.getMonth()] || '';

    const timeOpts = { hour: '2-digit', minute: '2-digit' };
    const sh = s.toLocaleTimeString('fr-FR', timeOpts);
    const eh = e.toLocaleTimeString('fr-FR', timeOpts);

    // "Mer 09 Oct - 18:30 à 20:00"
    return `${wd} ${dd} ${mo} - ${sh} à ${eh}`;
  };

  // --- Helper: always look up profiles by stringified id ---
  const profileOf = (map, uid) => (map && (map[String(uid)] || map[uid])) || null;

  // Affiche un avatar avec pastille de niveau si dispo
  const LevelAvatar = ({ profile = {}, size = 56, rsvpStatus, selected, onPress }) => {
    const uri = profile?.avatar_url || null;
    const fallback = profile?.display_name || profile?.email || 'Joueur';
    const phone = profile?.phone || null;
    const level = profile?.niveau ?? profile?.level ?? null; // supporte `niveau` ou `level`
  
    return (
      <View style={{ position: 'relative', width: size, height: size }}>
        <Avatar
          uri={uri}
          size={size}
          rsvpStatus={rsvpStatus}
          fallback={fallback}
          phone={phone}
          onPress={onPress}
          selected={selected}
        />
        {level != null && level !== '' && (
          <View
            style={{
              position: 'absolute',
              right: -4,
              bottom: -4,
              width: Math.max(22, Math.round(size * 0.38)),
              height: Math.max(22, Math.round(size * 0.38)),
              borderRadius: Math.max(11, Math.round(size * 0.19)),
              backgroundColor: colorForLevel(level), // fond = couleur du niveau
              borderWidth: 1,
              borderColor: '#ffffff',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                color: '#000000', // texte noir
                fontWeight: '900',
                fontSize: Math.max(10, Math.round(size * 0.34 * 0.6)),
              }}
            >
              {String(level)}
            </Text>
          </View>
        )}
      </View>
    );
  };

  const SlotRow = ({ item, type }) => {
    const userIds = type === "ready" ? item.ready_user_ids || [] : item.hot_user_ids || [];
    const [selectedIds, setSelectedIds] = React.useState([]);
    const toggleSelect = (uid) => {
      setSelectedIds((prev) => {
        const id = String(uid);
        if (prev.includes(id)) return prev.filter((x) => x !== id);
        if (prev.length >= 4) return prev; // keep max 4
        return [...prev, id];
      });
    };
    const canCreate = type === 'ready' && selectedIds.length === 4;
    return (
      <View style={[cardStyle, { minHeight: 120 }]}>
        <Text style={{ fontWeight: "800", color: "#111827", fontSize: 18, marginBottom: 6 }}>
          {formatRange(item.starts_at, item.ends_at)}
        </Text>
        <Divider m={8} />
        <View style={{ marginBottom: 8 }}>
          <Badge tone='amber' text={`${type === 'ready' ? '🎾' : '🔥'} ${userIds.length} joueurs`} />
        </View>
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
          {userIds.map((uid) => {
            const p = profileOf(profilesById, uid);
            return (
              <LevelAvatar
                key={String(uid)}
                profile={p}
                onPress={() => toggleSelect(uid)}
                selected={selectedIds.includes(String(uid))}
                size={56}
              />
            );
          })}
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {type === "ready" ? (
            <Pressable
              disabled={!canCreate}
              accessibilityState={{ disabled: !canCreate }}
              onPress={canCreate ? press("Créer un match", () => onCreateIntervalMatch(item.starts_at, item.ends_at, selectedIds)) : undefined}
              accessibilityRole="button"
              accessibilityLabel="Créer un match pour ce créneau"
              style={({ pressed }) => [
                { backgroundColor: canCreate ? '#15803d' : '#ff751f', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
                Platform.OS === "web" ? { cursor: canCreate ? 'pointer' : 'not-allowed', opacity: canCreate ? 1 : 0.85 } : null,
                pressed && canCreate ? { opacity: 0.8 } : null,
              ]}
            >
              {!canCreate ? (
                <Image source={clickIcon} style={{ width: 28, height: 28, marginRight: 8, tintColor: 'white' }} />
              ) : null}
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {canCreate && (
                  <Image source={racketIcon} style={{ width: 24, height: 24, marginRight: 8, tintColor: 'white' }} />
                )}
                <Text style={{ color: "white", fontWeight: "800", fontSize: 20 }}>
                  {canCreate ? "Créer un match" : "Sélectionne 4 joueurs"}
                </Text>
              </View>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  };

// --- 1h30 ---
const LongSlotRow = ({ item }) => {
  const directIds = item.long_user_ids || [];

  // Fallback: calcul local si la vue ne fournit pas les ids
  const [availIds, setAvailIds] = React.useState([]);
  const [extraProfiles, setExtraProfiles] = React.useState({});

  React.useEffect(() => {
    (async () => {
      if ((directIds || []).length > 0) {
        setAvailIds([]);
        setExtraProfiles({});
        return;
      }
      const s = item?.starts_at;
      const e = item?.ends_at;
      if (!s || !e) return setAvailIds([]);

      const ids = await computeAvailableUserIdsForInterval(groupId, s, e);
      setAvailIds(Array.isArray(ids) ? ids : []);

      const missing = (Array.isArray(ids) ? ids : []).filter((id) => !profilesById[id]);
      if (missing.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url, email, niveau, phone')
          .in('id', missing);
        const map = Object.fromEntries((profs || []).map((p) => [p.id, p]));
        setExtraProfiles(map);
      } else {
        setExtraProfiles({});
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.starts_at, item?.ends_at, profilesById, groupId]);

  const userIds = (directIds && directIds.length) ? directIds : availIds;

  // Selection state and helpers
  const [selectedIds, setSelectedIds] = React.useState([]);
  const toggleSelect = (uid) => {
    setSelectedIds((prev) => {
      const id = String(uid);
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 4) return prev;
      return [...prev, id];
    });
  };
  const canCreate = selectedIds.length === 4;

  return (
    <View style={[cardStyle, { minHeight: 120 }]}>
      <Text style={{ fontWeight: "800", color: "#111827", fontSize: 18, marginBottom: 6 }}>
        {formatRange(item.starts_at, item.ends_at)}
      </Text>

      <View style={{ flexDirection: "row", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
        {userIds.map((uid) => {
          const p = profilesById[String(uid)] || extraProfiles[uid] || {};
          return (
            <LevelAvatar
              key={String(uid)}
              profile={p}
              onPress={() => toggleSelect(uid)}
              selected={selectedIds.includes(String(uid))}
              size={56}
            />
          );
        })}
      </View>

      <Divider m={8} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable
          disabled={!canCreate}
          accessibilityState={{ disabled: !canCreate }}
          onPress={canCreate ? press("Créer un match", () => onCreateIntervalMatch(item.starts_at, item.ends_at, selectedIds)) : undefined}
          accessibilityRole="button"
          accessibilityLabel="Créer un match pour ce créneau 1h30"
          style={({ pressed }) => [
            { backgroundColor: canCreate ? '#15803d' : '#ff751f', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
            Platform.OS === "web" ? { cursor: canCreate ? 'pointer' : 'not-allowed', opacity: canCreate ? 1 : 0.85 } : null,
            pressed && canCreate ? { opacity: 0.8 } : null,
          ]}
        >
          {!canCreate ? (
            <Image source={clickIcon} style={{ width: 28, height: 28, marginRight: 8, tintColor: 'white' }} />
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {canCreate && (
              <Image source={racketIcon} style={{ width: 24, height: 24, marginRight: 8, tintColor: 'white' }} />
            )}
            <Text style={{ color: "white", fontWeight: "800", fontSize: 20 }}>
              {canCreate ? "Créer un match" : "Sélectionne 4 joueurs"}
            </Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
};

// --- 1h ---
const HourSlotRow = ({ item }) => {
  const directIds = item.hour_user_ids || [];

  const [availIds, setAvailIds] = React.useState([]);
  const [extraProfiles, setExtraProfiles] = React.useState({});

  React.useEffect(() => {
    (async () => {
      if ((directIds || []).length > 0) {
        setAvailIds([]);
        setExtraProfiles({});
        return;
      }
      const s = item?.starts_at;
      const e = item?.ends_at;
      if (!s || !e) return setAvailIds([]);

      const ids = await computeAvailableUserIdsForInterval(groupId, s, e);
      setAvailIds(Array.isArray(ids) ? ids : []);

      const missing = (Array.isArray(ids) ? ids : []).filter((id) => !profilesById[id]);
      if (missing.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url, email, niveau, phone')
          .in('id', missing);
        const map = Object.fromEntries((profs || []).map((p) => [p.id, p]));
        setExtraProfiles(map);
      } else {
        setExtraProfiles({});
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.starts_at, item?.ends_at, profilesById, groupId]);

  const userIds = (directIds && directIds.length) ? directIds : availIds;

  // Selection state and helpers
  const [selectedIds, setSelectedIds] = React.useState([]);
  const toggleSelect = (uid) => {
    setSelectedIds((prev) => {
      const id = String(uid);
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 4) return prev;
      return [...prev, id];
    });
  };
  const canCreate = selectedIds.length === 4;

  return (
    <View style={[cardStyle, { minHeight: 120 }]}>
      <Text style={{ fontWeight: "800", color: "#111827", fontSize: 18, marginBottom: 6 }}>
        {formatRange(item.starts_at, item.ends_at)}
      </Text>

      <View style={{ flexDirection: "row", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
        {userIds.map((uid) => {
          const p = profilesById[String(uid)] || extraProfiles[uid] || {};
          return (
            <LevelAvatar
              key={String(uid)}
              profile={p}
              onPress={() => toggleSelect(uid)}
              selected={selectedIds.includes(String(uid))}
              size={56}
            />
          );
        })}
      </View>

      <Divider m={8} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable
          disabled={!canCreate}
          accessibilityState={{ disabled: !canCreate }}
          onPress={canCreate ? press("Créer un match", () => onCreateIntervalMatch(item.starts_at, item.ends_at, selectedIds)) : undefined}
          accessibilityRole="button"
          accessibilityLabel="Créer un match pour ce créneau 1h"
          style={({ pressed }) => [
            { backgroundColor: canCreate ? '#15803d' : '#ff751f', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
            Platform.OS === "web" ? { cursor: canCreate ? 'pointer' : 'not-allowed', opacity: canCreate ? 1 : 0.85 } : null,
            pressed && canCreate ? { opacity: 0.8 } : null,
          ]}
        >
          {!canCreate ? (
            <Image source={clickIcon} style={{ width: 28, height: 28, marginRight: 8, tintColor: 'white' }} />
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {canCreate && (
              <Image source={racketIcon} style={{ width: 24, height: 24, marginRight: 8, tintColor: 'white' }} />
            )}
            <Text style={{ color: "white", fontWeight: "800", fontSize: 20 }}>
              {canCreate ? "Créer un match" : "Sélectionne 4 joueurs"}
            </Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
};

  // Small card renderers for RSVP and confirmed lists
  const MatchCard = ({ m }) => {
    const slot = m.time_slots || {};
    const rsvps = rsvpsByMatch[m.id] || [];
    // --- Begin: inserted availIds/extraProfiles state and effect for confirmed card
    const [availIds, setAvailIds] = React.useState([]);
    const [extraProfiles, setExtraProfiles] = React.useState({});

    React.useEffect(() => {
      (async () => {
        const s = m?.time_slots?.starts_at;
        const e = m?.time_slots?.ends_at;
        if (!s || !e) return setAvailIds([]);
        const ids = await computeAvailableUserIdsForInterval(groupId, s, e);
        setAvailIds(Array.isArray(ids) ? ids : []);
        const missing = (Array.isArray(ids) ? ids : []).filter((id) => !profilesById[id]);
        if (missing.length) {
          const { data: profs } = await supabase
            .from('profiles')
            .select('id, display_name, avatar_url, email, niveau, phone')
            .in('id', missing);
          const map = Object.fromEntries((profs || []).map((p) => [p.id, p]));
          setExtraProfiles(map);
        } else {
          setExtraProfiles({});
        }
      })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [m?.id, m?.time_slots?.starts_at, m?.time_slots?.ends_at, groupId, rsvpsByMatch]);
    // --- End: inserted availIds/extraProfiles state and effect
    return (
      <View style={cardStyle}>
        <Text style={{ fontWeight: '800', color: '#111827', fontSize: 18, marginBottom: 6 }}>{formatRange(slot.starts_at, slot.ends_at)}</Text>
        <MetaLine m={m} />
        <Divider m={8} />
        <View style={{ marginBottom: 8 }}>
          <Text style={{ fontWeight: '800', color: '#111827' }}>
            {`✅ ${(rsvps || []).filter(r => (r.status || '').toLowerCase() === 'accepted').length}/4 confirmés`}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          {rsvps.map((r) => {
            const p = profilesById[r.user_id];
            return (
              <LevelAvatar
                key={r.user_id}
                profile={p}
                rsvpStatus={r.status}
                size={56}
              />
            );
          })}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
        </View>
      </View>
    );
  };

  const MatchCardConfirmed = ({ m }) => {
    const slot = m?.time_slots || {};
    const rsvps = rsvpsByMatch[m.id] || [];
    const accepted = rsvps.filter(r => (String(r.status || '').toLowerCase() === 'accepted'));
    const acceptedCount = accepted.length;
    const reserverName =
      profilesById?.[String(m?.court_reserved_by)]?.display_name ||
      profilesById?.[String(m?.court_reserved_by)]?.name ||
      null;

    const [reserved, setReserved] = React.useState(!!m?.is_court_reserved);
    const [savingReserved, setSavingReserved] = React.useState(false);

    const toggleReserved = React.useCallback(async () => {
      if (savingReserved) return;
      try {
        setSavingReserved(true);
        const next = !reserved;
        setReserved(next); // UI optimiste
        const { error } = await supabase
          .from('matches')
          .update({ is_court_reserved: next })
          .eq('id', m.id);
        if (error) {
          setReserved(!next); // rollback
          if (Platform.OS === 'web') {
            if (typeof window !== 'undefined' && window.alert) window.alert("Échec de mise à jour 'terrain réservé'.");
          } else {
            Alert.alert('Erreur', "Échec de mise à jour 'terrain réservé'.");
          }
        }
      } finally {
        setSavingReserved(false);
      }
    }, [reserved, savingReserved, m?.id]);

    return (
      <View style={[cardStyle, { backgroundColor: reserved ? '#dcfce7' : '#fee2e2', borderColor: '#063383' }]}>
        <Text style={{ fontWeight: '800', color: '#111827', fontSize: 18, marginBottom: 6 }}>
          {formatRange(slot.starts_at, slot.ends_at)}
        </Text>

        {/* Avatars confirmés */}
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          {accepted.map((r) => {
            const p = profilesById[r.user_id];
            return (
              <LevelAvatar
                key={`acc-${r.user_id}`}
                profile={p}
                rsvpStatus="accepted"
                size={56}
              />
            );
          })}
        </View>

        {/* Boutons contacter et réserver */}
        <View
          style={{
            marginTop: 4,
            marginBottom: 4,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {/* Bouton contacter un club */}
          <Pressable
            onPress={() => Linking.openURL('tel:0376451967')}
            style={{
              flex: 1,
              backgroundColor: '#480c3d', // violine
              paddingVertical: 2,
              paddingHorizontal: 0,
              borderRadius: 8,
              alignSelf: 'center',
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
              }}
            >
              <Image
                source={require('../../../assets/icons/hercule.png')}
                style={{
                  width: 55,
                  height: 55,
                  resizeMode: 'contain',
                  tintColor: 'white',
                  marginRight:0,
                  marginLeft: -12,
                  shadowColor: '#fff',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.8,
                  shadowRadius: 3,          // espace entre icône et texte
                }}
              />
              <Text
                style={{
                  color: '#ea5b0c',
                  fontWeight: '900',
                  fontSize: 14,
                  textAlign: 'center',
                  textAlignVertical: 'center', // Android
                  includeFontPadding: false,
                  marginTop: 4,   // Android: supprime le padding haut/bas de la police
                  lineHeight: 14,
                }}
              >
                APPELER{'\n'}HERCULE
              </Text>
            </View>
          </Pressable>

          {/* Bouton réserver / réservé */}
          <Pressable
            onPress={() => toggleCourtReservation(m.id, !!m.is_court_reserved)}
            style={{
              flex: 1,
              backgroundColor: m?.is_court_reserved ? '#10b981' : '#ef4444',
              padding: 10,
              borderRadius: 8,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {m?.is_court_reserved && m.court_reserved_by && profilesById?.[String(m.court_reserved_by)]?.avatar_url ? (
              <Image
                source={{ uri: profilesById[String(m.court_reserved_by)].avatar_url }}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 20,
                  marginRight: 16,
                  borderWidth: 0,
                  borderColor: '#fff',
                  resizeMode: 'cover',
                }}
              />
            ) : (
              <Image
                source={require('../../../assets/icons/calendrier.png')}
                style={{
                  width: 36,
                  height: 36,
                  marginRight: 16,
                  shadowColor: '#fff',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.8,
                  shadowRadius: 3,
                  resizeMode: 'contain',
                  tintColor: 'white',
                }}
              />
            )}

            <Text
              style={{
                color: '#ffffff',
                fontWeight: '900',
                fontSize: 12,
                textAlign: 'center',
              }}
            >
              {m?.is_court_reserved ? 'PISTE\nRÉSERVÉE' : 'PISTE NON\nRÉSERVÉE'}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const MatchCardPending = ({ m, rsvps: rsvpsProp }) => {
    const slot = m.time_slots || {};
    const rsvps = Array.isArray(rsvpsProp) ? rsvpsProp : (rsvpsByMatch[m.id] || []);
    // Split RSVP buckets
    const accepted = rsvps.filter(r => (r.status || '').toString().toLowerCase() === 'accepted');
    const maybes   = rsvps.filter(r => (r.status || '').toString().toLowerCase() === 'maybe');
    const declined = rsvps.filter(r => (r.status || '').toString().toLowerCase() === 'no');
    const acceptedCount = accepted.length;
    const pendingBg =
      acceptedCount >= 4 ? '#dcfce7' :        // 4 confirmés → vert clair
      acceptedCount === 3 ? '#fef9c3' :       // 3 → jaune clair
      acceptedCount === 2 ? '#ffedd5' :       // 2 → orange clair
      acceptedCount === 1 ? '#fee2e2' :       // 1 → rouge clair
      '#ffffff';                              // 0 → blanc

    // Me + status
    const mine = rsvps.find((r) => String(r.user_id) === String(meId));
    const isAccepted = ((mine?.status || '').toString().trim().toLowerCase() === 'accepted');

    // Creator heuristic: first accepted, else earliest RSVP row
    const creatorUserId = (() => {
      if (!Array.isArray(rsvps) || rsvps.length === 0) return null;
      const src = accepted.length ? accepted : rsvps;
      const sorted = [...src].sort((a,b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
      return sorted[0]?.user_id || null;
    })();
    const isCreator = creatorUserId && meId ? String(creatorUserId) === String(meId) : false;

    // --- Begin: inserted availIds/extraProfiles state and effect
    const [availIds, setAvailIds] = React.useState([]);
    const [extraProfiles, setExtraProfiles] = React.useState({});

    React.useEffect(() => {
      (async () => {
        const s = m?.time_slots?.starts_at;
        const e = m?.time_slots?.ends_at;
        if (!s || !e) return setAvailIds([]);

        const ids = await computeAvailableUserIdsForInterval(groupId, s, e);
        // Exclure ceux qui sont déjà acceptés ou ont refusé
        const acceptedSet = new Set(accepted.map((r) => String(r.user_id)));
        const declinedSet = new Set(declined.map((r) => String(r.user_id)));
        const filtered = ids.filter((id) => !acceptedSet.has(String(id)) && !declinedSet.has(String(id)));
        setAvailIds(filtered);

        // Charger les profils manquants localement (dans ce composant)
        const missing = filtered.filter((id) => !profilesById[id]);
        if (missing.length) {
          const { data: profs } = await supabase
            .from('profiles')
            .select('id, display_name, avatar_url, email, niveau, phone')
            .in('id', missing);
          const map = Object.fromEntries((profs || []).map((p) => [p.id, p]));
          setExtraProfiles(map);
        } else {
          setExtraProfiles({});
        }
      })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [m?.id, m?.time_slots?.starts_at, m?.time_slots?.ends_at, groupId, rsvpsByMatch]);
    // --- End: inserted availIds/extraProfiles state and effect

    return (
      <View style={[cardStyle, { backgroundColor: pendingBg, borderColor: '#063383' }]}>
        {/* Ligne 1 — Date + heure + icône confirmations */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 4,
          }}
        >
          <Text style={{ fontWeight: '800', color: '#111827', fontSize: 18 }}>
            {formatRange(slot.starts_at, slot.ends_at)}
          </Text>

          {/* Icône à droite selon le nombre de confirmés (rien si 0) */}
          {acceptedCount > 0 ? (
            (() => {
              const src =
                acceptedCount === 1
                  ? require('../../../assets/icons/1confirme.png')
                  : acceptedCount === 2
                  ? require('../../../assets/icons/2confirme.png')
                  : acceptedCount === 3
                  ? require('../../../assets/icons/3confirme.png')
                  : require('../../../assets/icons/4confirme.png');
              return (
                <Image
                  source={src}
                  style={{ width: 75, height: 28, resizeMode: 'contain', marginLeft: 8 }}
                />
              );
            })()
          ) : null}
        </View>
        {/* Ligne 2 — Avatars des joueurs qui ont confirmé (bordure verte) */}
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          {accepted.map((r) => {
            const p = profilesById[r.user_id];
            return (
              <LevelAvatar
                key={`acc-${r.user_id}`}
                profile={p}
                rsvpStatus="accepted"
                size={56}
              />
            );
          })}
        </View>

        {/* Ligne 4 — En attente / Remplaçants : une SEULE ligne d'avatars (orange), non cliquables */}
        <View style={{ marginTop: 2, marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ fontWeight: '800', color: '#111827' }}>En attente / Remplaçants</Text>
          </View>

          {(() => {
            // Build the pending list. If we computed availIds, use them as MAYBE candidates (one line),
            // then always append the declined users (red border) so they are visible too.
            const maybeFromAvail = (Array.isArray(availIds) && availIds.length)
              ? availIds.map((id) => ({ user_id: id, status: 'maybe' }))
              : maybes.map((r) => ({ user_id: r.user_id, status: 'maybe' }));

            const declinedList = declined.map((r) => ({ user_id: r.user_id, status: 'no' }));
            const combined = [...maybeFromAvail, ...declinedList];

            if (!combined.length) {
              return <Text style={{ color: '#6b7280' }}>Aucun joueur en attente.</Text>;
            }

            return (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 4, }}>
                {combined.map((r) => {
                  const uid = r.user_id;
                  const p = profilesById[uid] || extraProfiles[uid] || {};
                  return (
                    <LevelAvatar
                      key={`pend-${uid}`}
                      profile={p}
                      rsvpStatus={r.status}
                      size={48}
                    />
                  );
                })}
              </ScrollView>
            );
          })()}
        </View>

        {/* Wrap Ligne 4 and Ligne 5 in a single Fragment */}
        <>
        {/* Ligne 5 — Boutons d’action */}
        {!isAccepted ? (
          <View
            style={{
              flexDirection: 'row',
              gap: 8,
              flexWrap: 'wrap',
              marginBottom: 12,
            }}
          >
            <Pressable
              onPress={press('Confirmer ma participation', () => onRsvpAccept(m.id))}
              accessibilityRole="button"
              accessibilityLabel="Confirmer ma participation à ce match"
              style={({ pressed }) => [
                {
                  backgroundColor: '#1a4b97',
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 8,
                },
                Platform.OS === 'web' ? { cursor: 'pointer' } : null,
                pressed ? { opacity: 0.8 } : null,
              ]}
            >
              <Text style={{ color: 'white', fontWeight: '800' }}>
                Confirmer ma participation
              </Text>
            </Pressable>

            <Pressable
              onPress={press('Refuser', () => onRsvpDecline(m.id))}
              accessibilityRole="button"
              accessibilityLabel="Refuser ce match"
              style={({ pressed }) => [
                {
                  backgroundColor: '#b91c1c',
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 8,
                },
                Platform.OS === 'web' ? { cursor: 'pointer' } : null,
                pressed ? { opacity: 0.85 } : null,
              ]}
            >
              <Text style={{ color: 'white', fontWeight: '800' }}>Refuser</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ gap: 8, marginBottom: 12 }}>
            {/* Ligne actions: vertical column of full-width buttons */}
            <View style={{ gap: 8 }}>
              {/* Annuler ma participation (rouge clair) */}
              <Pressable
                onPress={press('Annuler ma participation', () => onRsvpCancel(m.id))}
                accessibilityRole="button"
                accessibilityLabel="Annuler ma participation"
                style={({ pressed }) => [
                  {
                    flex: 1,
                    alignSelf: 'stretch',
                    backgroundColor: '#fecaca',
                    borderColor: '#ef4444',
                    borderWidth: 1,
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderRadius: 8,
                  },
                  Platform.OS === 'web' ? { cursor: 'pointer' } : null,
                  pressed ? { opacity: 0.9 } : null,
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Ionicons name="exit-outline" size={22} color="#7f1d1d" />
                  <Text style={{ color: '#7f1d1d', fontWeight: '800' }}>
                    Annuler ma participation
                  </Text>
                </View>
              </Pressable>

              {/* Annuler le match (créateur uniquement) — rouge vif */}
              {isCreator && (
                <Pressable
                  onPress={() => {
                    if (Platform.OS === 'web') {
                      const ok = window.confirm('Voulez-vous vraiment annuler ce match ?');
                      if (ok) onCancelMatch(m.id);
                    } else {
                      Alert.alert('Voulez-vous vraiment annuler ce match ?', '', [
                        { text: 'Annuler', style: 'cancel' },
                        {
                          text: "Confirmer l'annulation",
                          style: 'destructive',
                          onPress: () => onCancelMatch(m.id),
                        },
                      ]);
                    }
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Annuler le match"
                  style={({ pressed }) => [
                    {
                      flex: 1,
                      alignSelf: 'stretch',
                      backgroundColor: '#b91c1c',
                      paddingVertical: 10,
                      paddingHorizontal: 14,
                      borderRadius: 8,
                    },
                    Platform.OS === 'web' ? { cursor: 'pointer' } : null,
                    pressed ? { opacity: 0.9 } : null,
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <Ionicons name="close-circle-outline" size={22} color="white" />
                    <Text style={{ color: 'white', fontWeight: '800' }}>Annuler le match</Text>
                  </View>
                </Pressable>
              )}
            </View>
          </View>
        )}
        </>
      </View>
    );
  };

  if (!groupId) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text>Choisis un groupe</Text>
      </View>
    );
  }
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 16, backgroundColor: '#001831' }}>
      {/* Week navigator */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          marginBottom: 5,  // réduit l’espace sous la ligne
          marginTop: -10,    // réduit l’espace au-dessus (entre le header et cette ligne)
        }}
      >
        <Pressable
          onPress={() => setWeekOffset((x) => x - 1)}
          accessibilityRole="button"
          accessibilityLabel="Semaine précédente"
          hitSlop={10}
          style={{ padding: 8, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="caret-back" size={32} color={COLORS.primary} />
        </Pressable>

        <Text style={{ fontWeight: '900', fontSize: 16, color: '#ffffff' }}>
          {formatWeekRangeLabel(currentWs, currentWe)}
        </Text>

        <Pressable
          onPress={() => setWeekOffset((x) => x + 1)}
          accessibilityRole="button"
          accessibilityLabel="Semaine suivante"
          hitSlop={10}
          style={{ padding: 8, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="caret-forward" size={32} color={COLORS.primary} />
        </Pressable>
      </View>
      
{/* Sélecteur en 3 boutons (zone fond bleu) + sous-ligne 1h30/1h quand "proposés" */}
<View style={{ backgroundColor: '#001831', borderRadius: 12, padding: 10, marginBottom: 12 }}>
  <View style={{ flexDirection: 'row', gap: 8 }}>
{/* Matchs possibles */}
  <Pressable
    onPress={() => setTab('proposes')}
    accessibilityRole="button"
    accessibilityLabel="Voir les matchs possibles"
    style={({ pressed }) => [
      {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: tab === 'proposes' ? '#FF751F' : '#ffffff',
        borderWidth: (tab === 'proposes' || pressed) ? 2 : 0,
        borderColor: (tab === 'proposes' || pressed) ? '#ffffff' : 'transparent',
      },
      Platform.OS === 'web' ? { cursor: 'pointer' } : null,
      pressed ? { opacity: 0.92 } : null,
    ]}
  >
    {({ pressed }) => (
      <>
        <Text style={{ fontSize: 22 }}>{'🤝'}</Text>
        <View style={{ marginTop: 4, alignItems: 'center' }}>
          <Text
            style={{
              fontWeight: '900',
              color: (tab === 'proposes' || pressed) ? '#ffffff' : '#001831',
              textAlign: 'center',
            }}
          >
            {`${proposedTabCount} ${matchWord(proposedTabCount)} ${possibleWord(proposedTabCount)}`}
          </Text>
        </View>
      </>
    )}
  </Pressable>

    {/* Matchs à confirmer */}
    <Pressable
      onPress={() => setTab('rsvp')}
      accessibilityRole="button"
      accessibilityLabel="Voir les matchs à confirmer"
      style={({ pressed }) => [
        {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 10,
          borderRadius: 12,
          backgroundColor: tab === 'rsvp' ? '#FF751F' : '#ffffff',          
          borderWidth: (tab === 'rsvp' || pressed) ? 2 : 0,           // ✅ bordure visible si sélectionné ou pressé
          borderColor: (tab === 'rsvp' || pressed) ? '#001831' : 'transparent',
        },
        Platform.OS === 'web' ? { cursor: 'pointer' } : null,
      ]}
    >
      <Text style={{ fontSize: 22 }}>{'⏳'}</Text>
      <View style={{ marginTop: 4, alignItems: 'center' }}>
        <Text style={{ fontWeight: '900', color: tab === 'rsvp' ? '#ffffff' : '#001831', textAlign: 'center' }}>
          {`${rsvpTabCount} ${matchWord(rsvpTabCount)} à confirmer`}
        </Text>
      </View>
    </Pressable>

    {/* Matchs validés */}
    <Pressable
      onPress={() => setTab('valides')}
      accessibilityRole="button"
      accessibilityLabel="Voir les matchs validés"
      style={({ pressed }) => [
        {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 10,
          borderRadius: 12,
          backgroundColor: tab === 'valides' ? '#FF751F' : '#ffffff',
          borderWidth: (tab === 'valides' || pressed) ? 2 : 0,
          borderColor: (tab === 'valides' || pressed) ? '#ffffff' : 'transparent',
        },
        Platform.OS === 'web' ? { cursor: 'pointer' } : null,
        pressed ? { opacity: 0.92 } : null,
      ]}
    >
      <Text style={{ fontSize: 22 }}>{'🎾'}</Text>
      <View style={{ marginTop: 4, alignItems: 'center' }}>
        <Text style={{ fontWeight: '900', color: tab === 'valides' ? '#ffffff' : '#001831', textAlign: 'center' }}>
          {`${confirmedTabCount} ${matchWord(confirmedTabCount)} ${valideWord(confirmedTabCount)}`}
        </Text>
      </View>
    </Pressable>
  </View>

{tab === 'proposes' && (
  <>
    {mode === 'long' ? (
      <>
        {longSectionsWeek.length === 0 ? (
          <Text style={{ color: '#6b7280', marginBottom: 6 }}>Aucun créneau 1h30 prêt.</Text>
        ) : (
          <SectionList
            sections={longSectionsWeek}
            keyExtractor={(item) => item.key}
            renderSectionHeader={({ section }) => (
              <View style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
                <Text style={{ fontWeight: '900', color: '#111827' }}>{section.title}</Text>
              </View>
            )}
            renderItem={({ item }) => <LongSlotRow item={item} />}
            contentContainerStyle={{ paddingBottom: bottomPad }}
            scrollIndicatorInsets={{ bottom: bottomPad / 2 }}
            ListFooterComponent={() => <View style={{ height: bottomPad }} />}
            extraData={{ profilesById }}
          />
        )}
      </>
    ) : (
      <>
        {hourReadyWeek.length === 0 ? (
          <Text style={{ color: '#6b7280', marginBottom: 6 }}>Aucun créneau 1h prêt.</Text>
        ) : (
          <FlatList
            data={hourReadyWeek}
            keyExtractor={(x) => x.time_slot_id + '-hour'}
            renderItem={({ item }) => <HourSlotRow item={item} />}
            contentContainerStyle={{
              padding: 16,
              paddingBottom: Math.max(120, insets.bottom + 100),
            }}
            scrollIndicatorInsets={{ bottom: insets.bottom + 60 }}
          />
        )}
      </>
    )}
  </>
)}

{tab === 'rsvp' && (
  <>
    {rsvpMode === 'hour' ? (
      (pendingHourWeek?.length || 0) === 0 ? (
        <Text style={{ color: '#6b7280' }}>Aucun match 1h en attente.</Text>
      ) : (
        <FlatList
          data={pendingHourWeek.filter(m =>
            isInWeekRange(m?.time_slots?.starts_at, m?.time_slots?.ends_at, currentWs, currentWe)
          )}
          keyExtractor={(m) => `${m.id}-pHour-${(rsvpsByMatch[m.id] || []).length}`}
          renderItem={({ item }) => (
            <MatchCardPending m={item} rsvps={rsvpsByMatch[item.id] || []} />
          )}
          extraData={rsvpsVersion}
          contentContainerStyle={{ paddingBottom: bottomPad }}
          scrollIndicatorInsets={{ bottom: bottomPad / 2 }}
          ListFooterComponent={() => <View style={{ height: bottomPad }} />}
        />
      )
    ) : (
      (pendingLongWeek?.length || 0) === 0 ? (
        <Text style={{ color: '#6b7280' }}>Aucun match 1h30 en attente.</Text>
      ) : (
        <FlatList
          data={pendingLongWeek.filter(m =>
            isInWeekRange(m?.time_slots?.starts_at, m?.time_slots?.ends_at, currentWs, currentWe)
          )}
          keyExtractor={(m) => `${m.id}-pLong-${(rsvpsByMatch[m.id] || []).length}`}
          renderItem={({ item }) => (
            <MatchCardPending m={item} rsvps={rsvpsByMatch[item.id] || []} />
          )}
          extraData={rsvpsVersion}
          contentContainerStyle={{ paddingBottom: bottomPad }}
          scrollIndicatorInsets={{ bottom: bottomPad / 2 }}
          ListFooterComponent={() => <View style={{ height: bottomPad }} />}
        />
      )
    )}
  </>
)}

{tab === 'valides' && (
  <>
    {confirmedMode === 'long' ? (
      confirmedLong.length === 0 ? (
        <Text style={{ color: '#6b7280' }}>Aucun match 1h30 confirmé.</Text>
      ) : (
        <FlatList
          data={confirmedLong.filter(m =>
            isInWeekRange(m?.time_slots?.starts_at, m?.time_slots?.ends_at, currentWs, currentWe)
          )}
          keyExtractor={(m) => m.id + '-confirmed-long'}
          renderItem={({ item: m }) => (
            <MatchCardConfirmed m={m} />
          )}
          contentContainerStyle={{ paddingBottom: bottomPad }}
          scrollIndicatorInsets={{ bottom: bottomPad / 2 }}
          ListFooterComponent={() => <View style={{ height: bottomPad }} />}
        />
      )
    ) : (
      confirmedHour.length === 0 ? (
        <Text style={{ color: '#6b7280' }}>Aucun match 1h confirmé.</Text>
      ) : (
        <FlatList
          data={confirmedHour.filter(m =>
            isInWeekRange(m?.time_slots?.starts_at, m?.time_slots?.ends_at, currentWs, currentWe)
          )}
          keyExtractor={(m) => m.id + '-confirmed-hour'}
          renderItem={({ item: m }) => (
            <MatchCardConfirmed m={m} />
          )}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      )
    )}
  </>
)}

</View>
);
}