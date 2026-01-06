-- Migration: Trouver toutes les contraintes qui référencent profiles sans ON DELETE
-- Date: 2025-01-XX
-- Description: Identifie les contraintes problématiques qui bloquent la suppression

-- ============================================================================
-- 1. CONTRAINTES SANS ON DELETE
-- ============================================================================
SELECT 
  conname as constraint_name,
  conrelid::regclass as table_name,
  pg_get_constraintdef(oid) as constraint_definition,
  '❌ PROBLÈME: Pas de ON DELETE' as status
FROM pg_constraint
WHERE confrelid = 'profiles'::regclass
AND pg_get_constraintdef(oid) NOT LIKE '%ON DELETE%'
ORDER BY conrelid::regclass, conname;

-- ============================================================================
-- 2. TOUTES LES CONTRAINTES (pour référence)
-- ============================================================================
SELECT 
  conname as constraint_name,
  conrelid::regclass as table_name,
  pg_get_constraintdef(oid) as constraint_definition,
  CASE 
    WHEN pg_get_constraintdef(oid) LIKE '%ON DELETE CASCADE%' THEN '✅ CASCADE'
    WHEN pg_get_constraintdef(oid) LIKE '%ON DELETE SET NULL%' THEN '✅ SET NULL'
    WHEN pg_get_constraintdef(oid) LIKE '%ON DELETE RESTRICT%' THEN '⚠️ RESTRICT'
    WHEN pg_get_constraintdef(oid) LIKE '%ON DELETE NO ACTION%' THEN '⚠️ NO ACTION'
    ELSE '❌ PAS DE ON DELETE'
  END as delete_behavior
FROM pg_constraint
WHERE confrelid = 'profiles'::regclass
ORDER BY delete_behavior, conrelid::regclass, conname;

-- ============================================================================
-- 3. VÉRIFIER LES TRIGGERS SUR PROFILES
-- ============================================================================
SELECT 
  tgname as trigger_name,
  tgrelid::regclass as table_name,
  CASE tgenabled
    WHEN 'O' THEN '✅ Activé'
    WHEN 'D' THEN '❌ Désactivé'
    ELSE '⚠️ Autre'
  END as status,
  pg_get_triggerdef(oid) as trigger_definition
FROM pg_trigger
WHERE tgrelid = 'profiles'::regclass
AND tgenabled != 'D'
ORDER BY tgname;

-- ============================================================================
-- 4. VÉRIFIER LES POLITIQUES RLS
-- ============================================================================
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  CASE 
    WHEN qual IS NOT NULL THEN 'Avec condition'
    ELSE 'Sans condition'
  END as has_condition
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY policyname;

