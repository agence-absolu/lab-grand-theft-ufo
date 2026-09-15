// -------------------------------------------------------------- hall of fame
// Le jeu est un pur front statique : la persistance passe donc par Supabase,
// interrogé directement en REST depuis le navigateur avec la clé anon. Cette
// clé est publique par nature ; ce sont les règles RLS de la table qui
// autorisent l'insertion et la lecture, et rien d'autre (voir README).
//
// Quand Supabase n'est pas configuré (développement local sans .env) ou que le
// réseau tombe, on se rabat sur localStorage : le classement devient local au
// navigateur, mais l'écran de victoire reste fonctionnel.

const URL_BASE = import.meta.env.VITE_SUPABASE_URL?.replace(/\/+$/, '') || '';
const CLE = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const TABLE = 'hall_of_fame';
const CLE_LOCALE = 'gtu-hall-of-fame';

export const MAX_NOM = 16;
const LIMITE = 10;          // nombre de lignes affichées au tableau d'honneur

export const distant = Boolean(URL_BASE && CLE);

const entetes = {
  apikey: CLE,
  Authorization: `Bearer ${CLE}`,
  'Content-Type': 'application/json',
};

// Un pseudo est une saisie libre : on borne la longueur et on retire les
// caractères de contrôle avant de l'envoyer comme de l'afficher.
export function nettoyerNom(nom) {
  return String(nom ?? '')
    .replace(/[\p{C}]/gu, '')
    .trim()
    .slice(0, MAX_NOM);
}

function lireLocal() {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE_LOCALE) || '[]');
    return Array.isArray(brut) ? brut : [];
  } catch {
    return [];
  }
}

function ecrireLocal(lignes) {
  try {
    localStorage.setItem(CLE_LOCALE, JSON.stringify(lignes.slice(0, 50)));
  } catch { /* quota plein ou stockage refusé : le classement se perd, tant pis */ }
}

function trier(lignes) {
  return [...lignes].sort((a, b) => b.points - a.points || a.duree - b.duree);
}

/** Enregistre un score. Renvoie true si Supabase l'a bien reçu. */
export async function enregistrerScore(score) {
  const ligne = {
    nom: nettoyerNom(score.nom) || 'Anonyme',
    points: Math.max(0, Math.round(score.points)),
    captures: Math.max(0, Math.round(score.captures)),
    touches: Math.max(0, Math.round(score.touches)),
    duree: Math.max(0, Math.round(score.duree)),
  };

  if (distant) {
    try {
      const r = await fetch(`${URL_BASE}/rest/v1/${TABLE}`, {
        method: 'POST',
        headers: { ...entetes, Prefer: 'return=minimal' },
        body: JSON.stringify(ligne),
      });
      if (r.ok) return true;
    } catch { /* hors ligne : repli local ci-dessous */ }
  }

  ecrireLocal(trier([...lireLocal(), { ...ligne, cree_le: new Date().toISOString() }]));
  return false;
}

/** Les meilleurs scores, du plus élevé au plus faible. */
export async function meilleursScores() {
  if (distant) {
    try {
      const params = new URLSearchParams({
        select: 'nom,points,captures,touches,duree,cree_le',
        order: 'points.desc,duree.asc',
        limit: String(LIMITE),
      });
      const r = await fetch(`${URL_BASE}/rest/v1/${TABLE}?${params}`, { headers: entetes });
      if (r.ok) return await r.json();
    } catch { /* hors ligne : repli local ci-dessous */ }
  }

  return trier(lireLocal()).slice(0, LIMITE);
}
