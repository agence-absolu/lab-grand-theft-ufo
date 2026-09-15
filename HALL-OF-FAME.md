# Hall of fame — mise en place Supabase

Le jeu est un front statique : le classement partagé passe par l'API REST de
Supabase, appelée directement depuis le navigateur.

## 1. Créer la table

Dans le SQL Editor du projet Supabase :

```sql
create table public.hall_of_fame (
  id       bigint generated always as identity primary key,
  nom      text    not null check (char_length(nom) between 1 and 16),
  points   integer not null check (points >= 0),
  captures integer not null default 0 check (captures >= 0),
  touches  integer not null default 0 check (touches  >= 0),
  duree    integer not null default 0 check (duree    >= 0),
  ip_hash  text,
  cree_le  timestamptz not null default now()
);

alter table public.hall_of_fame enable row level security;

-- La clé anon est publique : cette règle est la seule chose qui borne ce qu'un
-- visiteur peut faire. Lecture pour tous, et rien d'autre : l'écriture passe
-- exclusivement par l'Edge Function, qui utilise la clé service_role (laquelle
-- contourne RLS). Aucune policy d'insertion n'est donc déclarée — c'est
-- volontaire, ne pas en rajouter une.
create policy "lecture publique" on public.hall_of_fame
  for select to anon using (true);

create index on public.hall_of_fame (points desc, duree asc);
create index on public.hall_of_fame (ip_hash, cree_le desc);
```

La colonne `ip_hash` sert au garde-fou de cadence : elle ne contient pas d'IP,
seulement une empreinte SHA-256 salée, non réversible et sans utilité hors de ce
comptage. Elle n'est jamais exposée au client (la policy de lecture porte sur la
table, mais le jeu ne sélectionne pas cette colonne ; pour la fermer tout à fait,
remplacer la lecture directe par une vue sans `ip_hash`).

## 1 bis. Déployer l'Edge Function

Le code vit dans `supabase/functions/soumettre-score/`. Avec la CLI Supabase :

```sh
npx supabase login
npx supabase link --project-ref <ref-du-projet>
# Sel du hachage d'IP : une chaîne aléatoire, à générer une fois et à ne plus changer
npx supabase secrets set SCORE_SEL="$(openssl rand -hex 16)"
# Facultatif mais recommandé une fois la démo en ligne : restreindre le CORS
npx supabase secrets set ORIGINE_AUTORISEE="https://lab.agence-absolu.com"
npx supabase functions deploy soumettre-score
```

`SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont injectés automatiquement dans
l'environnement de la fonction : il n'y a rien à configurer pour eux, et la clé
service_role ne quitte jamais le serveur.

## 2. Configurer le front

En local : `cp .env.example .env.local`, puis renseigner `VITE_SUPABASE_URL` et
`VITE_SUPABASE_ANON_KEY`.

En déploiement : ajouter les deux mêmes secrets dans GitHub (Settings › Secrets
and variables › Actions) et les exposer à l'étape de build du workflow —
Vite les inline dans le bundle, il n'y a rien à installer côté serveur.

## 3. Sans Supabase

Si les variables sont absentes ou le serveur injoignable, `halloffame.js` se
rabat sur `localStorage` : l'écran de victoire reste complet, mais le classement
n'est visible que sur l'appareil du joueur.

## Ce que l'Edge Function garantit — et ce qu'elle ne garantit pas

Elle refuse (422) les scores incohérents avec les règles du jeu : plus de points
que le troupeau enlevé ne peut en rapporter, plus de deux missiles encaissés
dans une partie gagnée, durée trop courte pour le nombre de vaches, valeurs
négatives ou non entières. Elle limite aussi à cinq envois par minute et par
appareil (429).

Elle ne rend pas la triche impossible. Le score reste calculé dans le
navigateur : un visiteur patient peut toujours soumettre une partie plausible
mais fictive. Aller plus loin supposerait de faire signer la partie par le jeu
lui-même (jeton délivré au démarrage, rejoué à la victoire) ou de rejouer la
partie côté serveur — hors de proportion pour une démo de lab. La barrière
posée ici arrête le collègue qui ouvre la console, pas un adversaire décidé.

## Migration depuis la version sans Edge Function

Si la table a été créée avec la policy `insertion publique`, la retirer — sinon
le navigateur peut contourner la fonction :

```sql
drop policy if exists "insertion publique" on public.hall_of_fame;
alter table public.hall_of_fame add column if not exists ip_hash text;
```
