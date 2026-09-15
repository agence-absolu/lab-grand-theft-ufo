// Edge Function : seule voie d'écriture du hall of fame.
//
// Le score est calculé dans le navigateur : il est donc, par nature, déclaratif.
// Cette fonction ne peut pas le vérifier — elle peut seulement refuser ce qui
// est incohérent au regard des règles du jeu, et brider la cadence des envois.
// C'est une barrière contre le collègue qui s'amuse dans la console, pas contre
// un adversaire motivé (voir HALL-OF-FAME.md).
//
// La clé service_role n'apparaît jamais côté client : elle est injectée dans
// l'environnement de la fonction par Supabase.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const MAX_NOM = 16;
const MAX_CAPTURES = 200;     // troupeau généreux : la densité dépend du viewport
const PTS_PAR_VACHE = 10;     // vache la plus coriace (5) × multiplicateur max (2)
const MAX_TOUCHES = 2;        // au 3e missile l'OVNI explose : une victoire en a au plus 2
const SEC_PAR_VACHE = 0.3;    // plancher de durée : enlever une vache prend du temps
const MAX_DUREE = 3 * 3600;   // trois heures : au-delà, la valeur n'a plus de sens
const FENETRE_MS = 60_000;    // fenêtre du garde-fou de cadence
const MAX_PAR_FENETRE = 5;    // envois tolérés par appareil sur cette fenêtre

const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('ORIGINE_AUTORISEE') || '*',
  // Le client envoie aussi la clé anon : sans ces deux en-têtes dans la liste,
  // le préliminaire CORS échoue et l'appel n'atteint jamais la fonction.
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

// L'IP n'est pas stockée telle quelle : seule une empreinte salée l'est, ce qui
// suffit à compter les envois d'un même appareil sans conserver d'identifiant.
async function empreinte(ip: string): Promise<string> {
  const sel = Deno.env.get('SCORE_SEL') || '';
  const octets = new TextEncoder().encode(`${sel}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', octets);
  return [...new Uint8Array(digest)].map((o) => o.toString(16).padStart(2, '0')).join('');
}

function nettoyerNom(brut: unknown): string {
  return String(brut ?? '').replace(/\p{C}/gu, '').trim().slice(0, MAX_NOM);
}

/** Renvoie le motif du refus, ou null si le score est plausible. */
function invalider(s: { points: number; captures: number; touches: number; duree: number }): string | null {
  const entiers = [s.points, s.captures, s.touches, s.duree];
  if (entiers.some((v) => !Number.isInteger(v) || v < 0)) return 'valeurs invalides';
  if (s.captures < 1 || s.captures > MAX_CAPTURES) return 'nombre de vaches invalide';
  if (s.touches > MAX_TOUCHES) return 'une partie gagnée encaisse au plus 2 missiles';
  if (s.duree > MAX_DUREE) return 'durée invalide';
  // Le plafond de points découle du barème : chaque vache vaut au mieux 5 points,
  // doublés par le multiplicateur de rapidité.
  if (s.points > s.captures * PTS_PAR_VACHE) return 'score incompatible avec le troupeau enlevé';
  if (s.duree < s.captures * SEC_PAR_VACHE) return 'partie trop rapide pour ce troupeau';
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ erreur: 'méthode non autorisée' }, 405);

  let corps: Record<string, unknown>;
  try {
    corps = await req.json();
  } catch {
    return json({ erreur: 'corps illisible' }, 400);
  }

  const nom = nettoyerNom(corps.nom) || 'Anonyme';
  const score = {
    points: Math.trunc(Number(corps.points)),
    captures: Math.trunc(Number(corps.captures)),
    touches: Math.trunc(Number(corps.touches)),
    duree: Math.trunc(Number(corps.duree)),
  };

  const motif = invalider(score);
  if (motif) return json({ erreur: motif }, 422);

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'inconnue';
  const ip_hash = await empreinte(ip);

  const depuis = new Date(Date.now() - FENETRE_MS).toISOString();
  const { count, error: errCompte } = await db
    .from('hall_of_fame')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ip_hash)
    .gte('cree_le', depuis);

  // Un garde-fou qui tombe en panne ne doit pas fermer le tableau d'honneur :
  // on laisse passer si le comptage échoue, le score reste validé sur le fond.
  if (!errCompte && (count ?? 0) >= MAX_PAR_FENETRE) {
    return json({ erreur: 'trop d’envois, patientez une minute' }, 429);
  }

  const { error } = await db.from('hall_of_fame').insert({ nom, ...score, ip_hash });
  if (error) return json({ erreur: 'enregistrement impossible' }, 500);

  return json({ ok: true }, 201);
});
