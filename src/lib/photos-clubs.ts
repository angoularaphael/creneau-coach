import type { ClubId } from '@/domain/contrat'

export type PhotoClub = {
  readonly src: string
  readonly alt: string
  readonly cadrage: string
}

/**
 * Photos réelles des cinq clubs, pour que le coach juge le lieu qu’il va
 * réellement louer : l’espace d’abord, les personnes ensuite.
 *
 * Ce fichier vivait dans `src/data/`, dossier ignoré par git (`data/` dans
 * .gitignore) : commité tel quel, il ne serait jamais parti et le build Vercel
 * aurait cassé la production. Il vit donc ici.
 *
 * Sources et traitements : CHANTIER-2026-10/outils/manifeste-coachs.json
 * (shooting B.M Photographie d’octobre 2026 pour États-Unis, Ramonville et les
 * Minimes ; photos déjà publiées des sites pour Saint-Cyprien et Portet). La
 * signature et les filigranes sont recadrés hors champ ; les crédits sont aux
 * mentions légales.
 */
export const PHOTOS_CLUBS = {
  minimes: {
    src: '/photos/clubs/minimes.webp',
    alt: 'Vue d’ensemble des rings, des sacs et du plateau d’entraînement du Boxing Center Minimes',
    cadrage: 'Rings, sacs et plateau',
  },
  'st-cyprien': {
    src: '/photos/clubs/saint-cyprien.webp',
    alt: 'Vue d’ensemble du ring, des sacs et des tatamis du Boxing Center Saint-Cyprien',
    cadrage: 'Ring, sacs et tatamis',
  },
  'etats-unis': {
    src: '/photos/clubs/etats-unis.webp',
    alt: 'Allée de sacs de frappe du Boxing Center Toulouse États-Unis',
    cadrage: 'Allée des sacs',
  },
  ramonville: {
    src: '/photos/clubs/ramonville.webp',
    alt: 'Vue du ring et de l’octogone du Boxing Center Ramonville',
    cadrage: 'Ring et octogone',
  },
  portet: {
    src: '/photos/clubs/portet/ring.webp',
    alt: 'Le ring de boxe du Boxing Center Portet-sur-Garonne sous les drapeaux, tapis bleu et rouge',
    cadrage: 'Ring et plateau',
  },
} as const satisfies Record<ClubId, PhotoClub>

export type PhotoGalerie = { readonly f: string; readonly titre: string; readonly alt: string }

const DOSSIER: Record<ClubId, string> = {
  minimes: 'minimes',
  'st-cyprien': 'saint-cyprien',
  'etats-unis': 'etats-unis',
  ramonville: 'ramonville',
  portet: 'portet',
}

/** Six vues par club, l’espace d’abord. `titre` nomme l’espace ; `alt` décrit la photo. */
export const GALERIES_CLUBS: Record<ClubId, readonly PhotoGalerie[]> = {
  'etats-unis': [
    { f: 'ring', titre: 'Le ring', alt: 'Le ring de boxe aux cordes bleues, vide, drapeaux au mur' },
    { f: 'octogone', titre: 'L’octogone', alt: 'L’octogone bleu sur son podium, protections BOXING CENTER' },
    { f: 'sacs', titre: 'Les sacs', alt: 'La rangée de sacs de frappe Boxing Center sous les drapeaux' },
    { f: 'musculation', titre: 'La musculation', alt: 'Le rig rouge, les bancs et les disques de la zone musculation' },
    { f: 'cardio', titre: 'Le cardio', alt: 'Les vélos à air et le matériel cardio près des fenêtres' },
    { f: 'accueil', titre: 'L’accueil', alt: 'L’accueil du club et le mur de la boutique Boxing Center' },
  ],
  ramonville: [
    { f: 'plateau', titre: 'Le plateau', alt: 'Vue d’ensemble du plateau : la cage, le ring et la mezzanine sous la charpente' },
    { f: 'octogone', titre: 'L’octogone', alt: 'L’octogone de 7 m, la mezzanine en bois et les drapeaux' },
    { f: 'ring', titre: 'Le ring', alt: 'Le ring de boxe aux cordes bleues sous la fresque Boxing Center' },
    { f: 'sacs', titre: 'Les sacs', alt: 'Les sacs suspendus à la charpente, le ring et la cage au fond' },
    { f: 'musculation', titre: 'La musculation', alt: 'Les disques de couleur et la cage au bord du couloir' },
    { f: 'sac-fresque', titre: 'La fresque', alt: 'Un sac de frappe devant la grande fresque peinte au mur' },
  ],
  minimes: [
    { f: 'plateau', titre: 'Le plateau', alt: 'La halle des Minimes : sacs suspendus, tapis bleu et ring au fond' },
    { f: 'sacs', titre: 'Les sacs', alt: 'Les sacs de frappe de la halle, la zone musculation au fond' },
    { f: 'allee-sacs', titre: 'L’allée des sacs', alt: 'L’allée des sacs Boxing Center et le tapis de circulation' },
    { f: 'cardio', titre: 'Le cardio', alt: 'Vélo à air, disques de couleur et racks sous les drapeaux' },
    { f: 'musculation', titre: 'La musculation', alt: 'Les machines guidées et les disques de la zone musculation' },
    { f: 'cross-training', titre: 'Le cross-training', alt: 'Les racks, les barres et les sacs de la zone cross-training' },
  ],
  'st-cyprien': [
    { f: 'plateau', titre: 'Le plateau', alt: 'Le plateau d’un seul tenant, tapis bleu et rouge, ring au fond' },
    { f: 'ring', titre: 'Le ring', alt: 'Le ring de boxe anglaise devant les fresques de boxeurs' },
    { f: 'sacs', titre: 'Les sacs', alt: 'Les sacs Metal alignés au bord du tapis bleu' },
    { f: 'tatamis', titre: 'Les tatamis', alt: 'Le grand tapis bleu et rouge, la zone cross au fond' },
    { f: 'musculation', titre: 'La musculation', alt: 'Les machines guidées, les rameurs et les racks' },
    { f: 'kettlebells', titre: 'Les kettlebells', alt: 'Les kettlebells rangés au pied de la cage' },
  ],
  portet: [
    { f: 'ring', titre: 'Le ring', alt: 'Le ring de boxe sous les drapeaux, tapis bleu et rouge' },
    { f: 'cage', titre: 'La cage', alt: 'La cage MMA Boxing Center sur le tapis rouge' },
    { f: 'sacs', titre: 'Les sacs', alt: 'Les sacs de frappe le long du mur peint, tapis bleu et rouge' },
    { f: 'musculation', titre: 'La musculation', alt: 'Les racks de musculation devant le mur rouge' },
    { f: 'halteres', titre: 'Les haltères', alt: 'Le rack d’haltères et le box de saut' },
    { f: 'cardio', titre: 'Le cardio', alt: 'Les rameurs et le vélo sur le gazon synthétique' },
  ],
}

export const cheminPhoto = (club: ClubId, f: string, petite = false) =>
  `/photos/clubs/${DOSSIER[club]}/${f}${petite ? '-800' : ''}.webp`
