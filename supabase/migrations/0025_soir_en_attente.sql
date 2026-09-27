-- ═══════════════════════════════════════════════════════════════════════════
-- LE SOIR EST PRÊT, MAIS FERMÉ — en attente de la décision d'Eddy.
--
-- La migration 0023 a fait deux choses : ouvrir le SCHÉMA à 19 h et 20 h
-- (bornes, tarif, fonction de réservation) ET insérer 96 créneaux types du soir
-- ACTIFS. La seconde allait au-delà de la consigne.
--
-- Eddy, 19 septembre 2026 : « Si le cahier des charges s'arrête à 19 h, il est
-- mieux de s'arrêter là et de ne pas parler de 19 h–21 h jusqu'à ce que je
-- demande. […] Bon, vas-y, mets le prix 15 euros, mais après je vais demander
-- si c'est nécessaire. »
--
-- Donc : le prix, oui ; les créneaux ouverts à la réservation, non. Relevé le
-- 27 septembre 2026 : les 96 gabarits du soir étaient actifs, et la base est
-- celle du site en ligne — des coachs pouvaient réserver des heures que le
-- propriétaire n'avait pas décidé d'ouvrir.
--
-- ── CE QUI RESTE EN PLACE ─────────────────────────────────────────────────
--
-- Les bornes du schéma (10..20), les deux lignes de tarif (19 h, 20 h en heure
-- pleine) et la fonction de réservation lue sur la table des tarifs. Rien n'est
-- défait : les créneaux sont seulement ÉTEINTS.
--
-- ── POUR OUVRIR LE SOIR, LE JOUR OÙ C'EST DÉCIDÉ ──────────────────────────
--
--   update public.coach_slot_templates set is_active = true where start_hour >= 19;
--
-- Une ligne, sans redéploiement. Et le texte public « de 10 h à 19 h » devra
-- changer le même jour.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

update public.coach_slot_templates
set is_active = false
where start_hour >= 19;

commit;
