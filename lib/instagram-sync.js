// lib/instagram-sync.js
// Fonctions pour synchroniser les posts Instagram avec les actualités du club

import { supabase } from './supabase';

/**
 * Récupère les posts Instagram via Facebook Graph API
 * @param {string} accessToken - Token d'accès Facebook/Instagram
 * @param {string} instagramUserId - ID du compte Instagram Business
 * @returns {Promise<Array>} Liste des posts Instagram
 */
export async function fetchInstagramPosts(accessToken, instagramUserId) {
  try {
    // Récupérer les médias Instagram via Graph API
    // Endpoint: /{instagram-user-id}/media
    const url = `https://graph.facebook.com/v18.0/${instagramUserId}/media?fields=id,caption,media_type,media_url,permalink,timestamp,thumbnail_url&access_token=${accessToken}&limit=25`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Facebook Graph API error: ${errorData.error?.message || response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.data || !Array.isArray(data.data)) {
      return [];
    }
    
    // Convertir les posts Instagram au format club_posts
    const posts = data.data
      .filter(item => item.media_type === 'IMAGE' || item.media_type === 'CAROUSEL_ALBUM')
      .map(item => ({
        instagram_post_id: item.id,
        title: item.caption ? (item.caption.length > 100 ? item.caption.substring(0, 100) + '...' : item.caption) : 'Post Instagram',
        content: item.caption || '',
        image_url: item.media_url || item.thumbnail_url || null,
        instagram_permalink: item.permalink || null,
        created_at: item.timestamp ? new Date(item.timestamp).toISOString() : new Date().toISOString(),
        source: 'instagram',
      }));
    
    return posts;
  } catch (error) {
    console.error('[InstagramSync] Erreur lors de la récupération des posts:', error);
    throw error;
  }
}

/**
 * Synchronise les posts Instagram pour un club
 * @param {string} clubId - ID du club
 * @returns {Promise<{success: boolean, newPosts: number, error?: string}>}
 */
export async function syncInstagramPosts(clubId) {
  try {
    // Récupérer le token depuis la table instagram_tokens
    const { data: tokenData, error: tokenError } = await supabase
      .from('instagram_tokens')
      .select('access_token, instagram_user_id')
      .eq('club_id', clubId)
      .single();
    
    if (tokenError) throw tokenError;
    
    if (!tokenData || !tokenData.access_token || !tokenData.instagram_user_id) {
      return { success: false, newPosts: 0, error: 'Instagram non configuré pour ce club' };
    }
    
    // Récupérer les posts Instagram
    const instagramPosts = await fetchInstagramPosts(
      tokenData.access_token,
      tokenData.instagram_user_id
    );
    
    if (instagramPosts.length === 0) {
      // Mettre à jour updated_at dans instagram_tokens
      await supabase
        .from('instagram_tokens')
        .update({ updated_at: new Date().toISOString() })
        .eq('club_id', clubId);
      
      return { success: true, newPosts: 0 };
    }
    
    // Récupérer les posts Instagram existants pour éviter les doublons
    const { data: existingPosts } = await supabase
      .from('club_posts')
      .select('instagram_post_id')
      .eq('club_id', clubId)
      .eq('source', 'instagram')
      .not('instagram_post_id', 'is', null);
    
    const existingIds = new Set((existingPosts || []).map(p => p.instagram_post_id));
    
    // Filtrer les nouveaux posts
    const newPosts = instagramPosts.filter(post => !existingIds.has(post.instagram_post_id));
    
    if (newPosts.length === 0) {
      // Mettre à jour updated_at dans instagram_tokens
      await supabase
        .from('instagram_tokens')
        .update({ updated_at: new Date().toISOString() })
        .eq('club_id', clubId);
      
      return { success: true, newPosts: 0 };
    }
    
    // Récupérer l'utilisateur actuel pour created_by
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('Utilisateur non connecté');
    }

    // Insérer les nouveaux posts
    const postsToInsert = newPosts.map(post => ({
      club_id: clubId,
      title: post.title,
      content: post.content,
      image_url: post.image_url,
      created_at: post.created_at,
      source: 'instagram',
      instagram_post_id: post.instagram_post_id,
      instagram_permalink: post.instagram_permalink,
      created_by: user.id,
    }));
    
    const { error: insertError } = await supabase
      .from('club_posts')
      .insert(postsToInsert);
    
    if (insertError) throw insertError;
    
    // Mettre à jour updated_at dans instagram_tokens
    await supabase
      .from('instagram_tokens')
      .update({ updated_at: new Date().toISOString() })
      .eq('club_id', clubId);
    
    return { success: true, newPosts: newPosts.length };
  } catch (error) {
    console.error('[InstagramSync] Erreur lors de la synchronisation:', error);
    return { success: false, newPosts: 0, error: error.message };
  }
}

/**
 * Vérifie si le token Instagram est valide et retourne des détails
 * @param {string} accessToken - Token d'accès Facebook/Instagram
 * @returns {Promise<{isValid: boolean, error?: string, userId?: string}>}
 */
export async function validateInstagramToken(accessToken) {
  try {
    // Étape 1 : Vérifier que le token est valide pour accéder au profil utilisateur
    const meUrl = `https://graph.facebook.com/v18.0/me?access_token=${accessToken}`;
    const meResponse = await fetch(meUrl);
    
    if (!meResponse.ok) {
      const errorData = await meResponse.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || 'Token invalide';
      const errorCode = errorData.error?.code;
      
      // Messages d'erreur spécifiques selon le code
      if (errorCode === 190) {
        return { 
          isValid: false, 
          error: 'Token expiré ou invalide. Générez un nouveau token depuis Graph API Explorer.' 
        };
      }
      if (errorCode === 200) {
        return { 
          isValid: false, 
          error: 'Permissions manquantes. Le token doit avoir les permissions : instagram_basic, pages_show_list, pages_read_engagement' 
        };
      }
      
      return { 
        isValid: false, 
        error: `Token invalide : ${errorMessage}` 
      };
    }
    
    const meData = await meResponse.json();
    if (!meData.id) {
      return { 
        isValid: false, 
        error: 'Impossible de récupérer l\'ID utilisateur avec ce token' 
      };
    }
    
    // Étape 2 : Vérifier que le token peut accéder aux pages (nécessaire pour Instagram)
    const pagesUrl = `https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}&limit=1`;
    const pagesResponse = await fetch(pagesUrl);
    
    if (!pagesResponse.ok) {
      const errorData = await pagesResponse.json().catch(() => ({}));
      return { 
        isValid: false, 
        error: `Le token n'a pas accès aux pages Facebook. Permission 'pages_show_list' requise. Erreur : ${errorData.error?.message || 'Inconnue'}` 
      };
    }
    
    return { 
      isValid: true, 
      userId: meData.id 
    };
  } catch (error) {
    console.error('[InstagramSync] Erreur lors de la validation du token:', error);
    return { 
      isValid: false, 
      error: `Erreur lors de la validation : ${error.message}` 
    };
  }
}

/**
 * Récupère l'ID du compte Instagram Business à partir d'un token Facebook
 * @param {string} accessToken - Token d'accès Facebook
 * @returns {Promise<string|null>} ID du compte Instagram Business
 */
export async function getInstagramBusinessAccountId(accessToken) {
  try {
    // Essayer d'abord de récupérer directement depuis /me si le token est pour une page
    // Si le token est généré pour une page directement, on peut récupérer l'ID Instagram de cette page
    try {
      const meUrl = `https://graph.facebook.com/v18.0/me?fields=instagram_business_account&access_token=${accessToken}`;
      const meResponse = await fetch(meUrl);
      
      if (meResponse.ok) {
        const meData = await meResponse.json();
        // Si c'est une page avec un compte Instagram connecté
        if (meData.instagram_business_account?.id) {
          return meData.instagram_business_account.id;
        }
        // Si c'est une page (a un id mais pas d'instagram_business_account), continuer
      }
    } catch (meError) {
      // Continuer avec la méthode des pages
      console.log('[InstagramSync] Token n\'est pas pour une page, essayons les pages de l\'utilisateur');
    }
    
    // D'abord, récupérer les pages Facebook de l'utilisateur
    const pagesUrl = `https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}`;
    const pagesResponse = await fetch(pagesUrl);
    
    if (!pagesResponse.ok) {
      const errorData = await pagesResponse.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || 'Impossible de récupérer les pages Facebook';
      const errorCode = errorData.error?.code;
      
      // Si l'erreur indique des permissions manquantes
      if (errorCode === 200 || errorMessage.includes('permission') || errorMessage.includes('Permission')) {
        throw new Error('Permission "pages_show_list" manquante. Le token doit avoir cette permission pour accéder aux pages Facebook.');
      }
      
      throw new Error(`Impossible de récupérer les pages Facebook: ${errorMessage}`);
    }
    
    const pagesData = await pagesResponse.json();
    
    if (!pagesData.data || pagesData.data.length === 0) {
      throw new Error('Aucune page Facebook trouvée. Solutions :\n\n1️⃣ Connecter Instagram à une page Facebook :\n   • Ouvrez Instagram sur mobile\n   • Paramètres > Compte > Passer à un compte professionnel\n   • Connectez votre compte à une page Facebook\n\n2️⃣ Générer le token pour la PAGE directement :\n   • Dans Graph API Explorer, sélectionnez votre PAGE Facebook (pas votre compte utilisateur)\n   • Dans "Utilisateur ou Page", choisissez votre page\n   • Puis générez le token avec les permissions requises');
    }
    
    // Pour chaque page, vérifier si elle a un compte Instagram connecté
    for (const page of pagesData.data) {
      const instagramUrl = `https://graph.facebook.com/v18.0/${page.id}?fields=instagram_business_account&access_token=${accessToken}`;
      const instagramResponse = await fetch(instagramUrl);
      
      if (instagramResponse.ok) {
        const instagramData = await instagramResponse.json();
        if (instagramData.instagram_business_account?.id) {
          return instagramData.instagram_business_account.id;
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('[InstagramSync] Erreur lors de la récupération de l\'ID Instagram:', error);
    throw error;
  }
}

/**
 * Échange un token court (short-lived) contre un token long (long-lived)
 * @param {string} shortLivedToken - Token court à échanger
 * @param {string} appId - ID de l'application Facebook
 * @param {string} appSecret - Secret de l'application Facebook
 * @returns {Promise<{access_token: string, expires_in: number}|null>}
 */
export async function exchangeShortLivedForLongLived(shortLivedToken, appId, appSecret) {
  try {
    const url = `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || 'Erreur lors de l\'échange du token');
    }
    
    const data = await response.json();
    return {
      access_token: data.access_token,
      expires_in: data.expires_in || 5184000, // 60 jours par défaut
    };
  } catch (error) {
    console.error('[InstagramSync] Erreur lors de l\'échange du token:', error);
    throw error;
  }
}

/**
 * Récupère les informations sur un token (type, expiration, etc.)
 * @param {string} accessToken - Token à analyser
 * @returns {Promise<{type: string, expires_at: number|null, is_valid: boolean}>}
 */
export async function getTokenInfo(accessToken) {
  try {
    const url = `https://graph.facebook.com/v18.0/debug_token?input_token=${accessToken}&access_token=${accessToken}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      return { type: 'unknown', expires_at: null, is_valid: false };
    }
    
    const data = await response.json();
    if (data.data) {
      return {
        type: data.data.type || 'unknown',
        expires_at: data.data.expires_at || null,
        is_valid: data.data.is_valid || false,
      };
    }
    
    return { type: 'unknown', expires_at: null, is_valid: false };
  } catch (error) {
    console.error('[InstagramSync] Erreur lors de la récupération des infos du token:', error);
    return { type: 'unknown', expires_at: null, is_valid: false };
  }
}

