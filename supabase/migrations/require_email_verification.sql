-- Migration: Exiger la vérification de l'email pour accéder à l'application
-- Date: 2025-11-21
-- Description: Cette migration documente la nécessité de vérifier l'email
--              La vérification est gérée au niveau de l'application (app/(auth)/signin.js)
--              et doit être configurée dans le dashboard Supabase

-- Note importante: 
-- Le schéma 'auth' est géré par Supabase et n'est pas accessible directement via SQL.
-- La vérification de l'email est donc gérée au niveau de l'application React Native.

-- Configuration requise dans le dashboard Supabase:
-- 1. Aller dans Authentication > Settings
-- 2. Activer "Enable email confirmations"
-- 3. Configurer les templates d'email si nécessaire
-- 4. Vérifier que "Confirm email" est activé dans les paramètres d'authentication

-- La vérification de l'email est implémentée dans app/(auth)/signin.js:
-- - Lors de la création de compte: l'utilisateur est déconnecté et doit vérifier son email
-- - Lors de la connexion: vérification que email_confirmed_at n'est pas null
-- - Si l'email n'est pas vérifié, l'utilisateur ne peut pas se connecter

-- Cette migration est principalement documentaire.
-- Aucune fonction SQL n'est nécessaire car la vérification se fait côté application.
