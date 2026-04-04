-- Le rayon de recherche n’est plus stocké en profil : 30 km par défaut côté app (préférences locales).
ALTER TABLE profiles DROP COLUMN IF EXISTS comfort_radius_km;
