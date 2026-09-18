# Supabase — réservation coachs (Junior)

Projet : `zpkdveyhcmxlkhuoudfr`  
Tables préfixe `coach_*`. **Pas** BOXPLUS. Eddy n’a pas de lot ici.

## Fichiers

| Fichier | Contenu |
|---------|---------|
| `migrations/20260918120000_coach_schema.sql` | Enums, clubs, profils, créneaux, résas, avoirs, jobs, audit |
| `migrations/20260918120100_coach_rls.sql` | RLS + vues staff (sans PDF / QR / id Deciplus) |
| `migrations/20260918120200_coach_seed.sql` | 5 clubs, espaces, tarifs, éducative, settings, docs |
| `migrations/20260918120300_coach_storage.sql` | Bucket privé `coach-private` |

## Appliquer (Dashboard)

SQL Editor du projet → coller **`all.sql`** (ou les 4 fichiers **dans l’ordre**).

Ou CLI (après `supabase login` + `supabase link --project-ref zpkdveyhcmxlkhuoudfr`) :

```bash
cd coach-reservation
npx supabase db push
```

## Seed métier

- Clubs : minimes, st-cyprien, etats-unis, ramonville, portet
- États-Unis : boxe / mma-sol / fitness — Portet : boxe-fitness / mma-sol
- Éducative mer+sam 15h–17h (sauf Portet, paramétrable BO)
- Offpeak 10 € / peak 15 € — capacité 2 — max 3 actives — hold 600 s
