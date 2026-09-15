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
  cree_le  timestamptz not null default now()
);

alter table public.hall_of_fame enable row level security;

-- La clé anon est publique : ces deux règles sont la seule chose qui borne ce
-- qu'un visiteur peut faire. Lecture pour tous, insertion pour tous, ni mise à
-- jour ni suppression.
create policy "lecture publique" on public.hall_of_fame
  for select to anon using (true);

create policy "insertion publique" on public.hall_of_fame
  for insert to anon with check (true);

create index on public.hall_of_fame (points desc, duree asc);
```

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

## Limites assumées

Le score est calculé côté client : rien n'empêche techniquement un visiteur
d'insérer un score fabriqué via la clé anon. Pour une démo de lab, c'est un
compromis volontaire ; le durcir demanderait une Edge Function signant les
parties.
