-- ═══════════════════════════════════════════════════════════════════════════
-- LES COMPTES DU PERSONNEL — deux back-offices, pas un back-office à deux
-- vitesses.
--
-- Décision d'Eddy, 19 septembre : « Les responsables de salle ont le back-office
-- à eux. […] Pour les cinq salles, on va créer un identifiant minimes,
-- saint-cyprien et ainsi de suite, avec le mot de passe. Et maintenant il y aura
-- le super admin, du coup, ce qui sera nous les devs. »
--
-- Donc un compte PAR SALLE, pas par personne. C'est un choix, et il a une
-- conséquence qu'il faut assumer par écrit : un identifiant partagé ne dit pas
-- QUI a agi. Le journal d'audit enregistrera « minimes », pas le prénom de la
-- personne. Tant que l'équipe d'une salle est petite et se connaît, c'est
-- acceptable ; le jour où il faudra imputer un geste à quelqu'un, il faudra un
-- compte par personne — la table est déjà faite pour, il suffira d'ajouter des
-- lignes avec le même `club_id`.
--
-- ── POURQUOI PAS BOXPLUS ─────────────────────────────────────────────────
--
-- Les comptes BOXPLUS (`app_users`) portent `admin` / `super_admin` et AUCUN
-- périmètre club. Les y ajouter, c'est modifier le schéma d'un autre produit
-- pour un besoin qui n'est pas le sien. Ces comptes-ci vivent donc chez nous.
-- Le super-admin BOXPLUS reste accepté en parallèle : c'est la porte de secours
-- si cette table devient inaccessible.
--
-- ── POURQUOI AUCUN MOT DE PASSE ICI ──────────────────────────────────────
--
-- Cette migration crée les comptes DÉSACTIVÉS et sans empreinte. Les mots de
-- passe sont posés par `scripts/creer-comptes-salle.mjs`, qui les tire au sort,
-- les affiche UNE FOIS et n'en garde que l'empreinte. Un secret écrit dans une
-- migration est un secret dans l'historique git — c'est déjà arrivé une fois
-- sur ce projet, ça ne se refait pas.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.coach_staff_accounts (
  identifiant   text primary key
    check (identifiant ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),

  -- `direction` voit les cinq clubs. `salle` ne voit que le sien.
  -- Le super-admin dev n'est PAS ici : il vient de l'environnement, pour qu'un
  -- accès de secours existe même si cette table est vide ou corrompue.
  role          text not null check (role in ('salle', 'direction')),

  -- NULL pour une direction, obligatoire pour une salle. Contrainte croisée :
  -- « pas de club » ne doit jamais pouvoir valoir « tous les clubs ».
  club_id       text references public.coach_clubs(id) on delete restrict,

  libelle       text not null,

  -- scrypt : sel et empreinte séparés, en hexadécimal. Le calcul se fait côté
  -- Node, pas en SQL — pgcrypto n'est pas garanti sur toutes les instances.
  sel           text,
  empreinte     text,

  is_active     boolean not null default false,
  cree_le       timestamptz not null default now(),
  derniere_connexion_le timestamptz,

  constraint coach_staff_perimetre_coherent check (
    (role = 'salle'     and club_id is not null) or
    (role = 'direction' and club_id is null)
  ),

  -- Un compte activé sans empreinte serait une porte ouverte.
  constraint coach_staff_actif_a_un_secret check (
    is_active = false or (sel is not null and empreinte is not null)
  )
);

comment on table public.coach_staff_accounts is
  'Comptes back-office. Un par salle (role=salle, club_id obligatoire) et la direction (role=direction, tous clubs). Le super-admin dev vient de l''environnement, pas d''ici.';

comment on column public.coach_staff_accounts.club_id is
  'Le périmètre. Lu dans la SESSION, jamais dans l''URL — cahier §20 : un responsable de salle ne doit pas voir les données des autres clubs.';

-- Un seul compte « salle » actif par club : sans ça, deux identifiants
-- concurrents pour Minimes se créent en silence et personne ne sait lequel fait
-- foi le jour d'un incident.
create unique index if not exists coach_staff_un_actif_par_club
  on public.coach_staff_accounts (club_id)
  where role = 'salle' and is_active;

-- ── Les comptes, désactivés, en attente de leur mot de passe ────────────────
-- `select` depuis coach_clubs : si un club est ajouté demain, on le verra
-- manquer ici plutôt que d'avoir une liste figée qui ment.

insert into public.coach_staff_accounts (identifiant, role, club_id, libelle)
select c.id, 'salle', c.id, 'Responsable ' || c.name
from public.coach_clubs c
on conflict (identifiant) do nothing;

insert into public.coach_staff_accounts (identifiant, role, club_id, libelle)
values ('direction', 'direction', null, 'Direction Boxing Center')
on conflict (identifiant) do nothing;

-- ── Verrouillage ───────────────────────────────────────────────────────────
-- Cette table ne doit JAMAIS être lisible par un client. Elle porte des
-- empreintes de mots de passe : `anon` et `authenticated` n'ont rien à y faire,
-- même en lecture seule. Seul le serveur (service_role) y touche.

alter table public.coach_staff_accounts enable row level security;

revoke all on public.coach_staff_accounts from public, anon, authenticated;
grant  all on public.coach_staff_accounts to service_role;

commit;
