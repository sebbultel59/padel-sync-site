-- Fonction RPC pour vérifier si un email existe déjà dans auth.users
-- Cette fonction peut être appelée depuis le client pour vérifier l'existence d'un email
-- avant de tenter la création d'un compte

CREATE OR REPLACE FUNCTION check_email_exists(email_to_check TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  email_exists BOOLEAN;
BEGIN
  -- Vérifier si l'email existe dans auth.users
  SELECT EXISTS(
    SELECT 1 
    FROM auth.users 
    WHERE email = email_to_check
  ) INTO email_exists;
  
  RETURN email_exists;
END;
$$;

-- Donner les permissions d'exécution à tous les utilisateurs authentifiés et non authentifiés
GRANT EXECUTE ON FUNCTION check_email_exists(TEXT) TO anon, authenticated;

