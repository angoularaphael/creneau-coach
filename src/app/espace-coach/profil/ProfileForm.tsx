'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import type { Me, ProfilePatch } from '@/lib/api/types';
import { IcoCheck, IcoDocument, IcoPlus } from '@/components/espace-coach/Icones';

/**
 * LE FORMULAIRE DU PROFIL.
 *
 * Les quatre appels n'ont pas changé : `PATCH /api/v1/me`, `POST /me/photo`,
 * `GET /me/export`, `DELETE /me`. Ce qui a changé, c'est ce que le coach lit.
 *
 * Il lisait « path privé », « (202) », « Upload refusé », « Erreur réseau » :
 * des mots de serveur. Chaque message dit maintenant ce qui s'est passé ET ce
 * qui n'a pas eu lieu (« vos modifications n'ont pas été enregistrées ») — on
 * ne laisse jamais un doute sur l'état de ses données.
 *
 * La demande de suppression se confirmait par la boîte grise du navigateur ;
 * elle se confirme ici, sur place, en deux temps, comme le reste de l'espace.
 */
export function ProfileForm({ me }: { me: Me }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [modifie, setModifie] = useState(false);
  const [photo, setPhoto] = useState<'aucune' | 'envoi' | 'ok'>(me.profile?.photo_path ? 'ok' : 'aucune');
  const [msgDonnees, setMsgDonnees] = useState<string | null>(null);
  const [errDonnees, setErrDonnees] = useState<string | null>(null);
  const [confirmerSuppression, setConfirmerSuppression] = useState(false);
  const idPhoto = useId();

  const initiales =
    [me.profile?.first_name, me.profile?.last_name]
      .map((s) => s?.trim()?.[0] ?? '')
      .join('')
      .toUpperCase() || 'BC';

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setMsg(null);
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const patch: ProfilePatch = {
      first_name: String(fd.get('first_name') || ''),
      last_name: String(fd.get('last_name') || ''),
      phone: String(fd.get('phone') || ''),
      city: String(fd.get('city') || ''),
      diploma: String(fd.get('diploma') || ''),
    };
    try {
      const res = await fetch('/api/v1/me', {
        method: 'PATCH',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(patch),
      });
      const body = await res.json();
      if (!res.ok) {
        setErr(body?.error?.message || 'Vos informations n’ont pas pu être enregistrées. Réessayez.');
      } else {
        setMsg('Profil enregistré. Vos prochains documents porteront ces informations.');
        setModifie(false);
      }
    } catch {
      setErr('La connexion a été interrompue : vos modifications n’ont pas été enregistrées. Réessayez.');
    } finally {
      setPending(false);
    }
  }

  async function onExport() {
    setErrDonnees(null);
    setMsgDonnees(null);
    const res = await fetch('/api/v1/me/export', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      setErrDonnees('L’export n’a pas pu être préparé. Réessayez dans un instant.');
      return;
    }
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'boxing-center-export.json';
    a.click();
    URL.revokeObjectURL(url);
    setMsgDonnees('Vos données sont téléchargées.');
  }

  async function onDeleteRequest() {
    setErrDonnees(null);
    setMsgDonnees(null);
    const res = await fetch('/api/v1/me', {
      method: 'DELETE',
      credentials: 'same-origin',
      cache: 'no-store',
    });
    setConfirmerSuppression(false);
    if (res.status === 202) {
      setMsgDonnees('Demande de suppression enregistrée : l’équipe Boxing Center s’en charge.');
    } else {
      setErrDonnees('La demande n’a pas pu être enregistrée. Réessayez, ou écrivez-nous depuis la page contact.');
    }
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    setMsg(null);
    setPhoto('envoi');
    const fd = new FormData();
    fd.set('file', file);
    const res = await fetch('/api/v1/me/photo', {
      method: 'POST',
      credentials: 'same-origin',
      body: fd,
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setPhoto(me.profile?.photo_path ? 'ok' : 'aucune');
      setErr(body?.error?.message || 'La photo n’a pas pu être envoyée. Vérifiez son format et son poids.');
    } else {
      setPhoto('ok');
      setMsg('Photo enregistrée.');
    }
  }

  return (
    <div className="ec-profil__grille">
      <form onSubmit={onSubmit} onInput={() => setModifie(true)} className="ec-formulaire ec-entree" style={{ ['--d' as string]: 2 }}>
        <fieldset className="ec-groupe">
          <legend>Identité</legend>
          <div className="ec-champs">
            <label className="ec-champ">
              <span>Prénom</span>
              <input name="first_name" defaultValue={me.profile?.first_name ?? ''} autoComplete="given-name" required />
            </label>
            <label className="ec-champ">
              <span>Nom</span>
              <input name="last_name" defaultValue={me.profile?.last_name ?? ''} autoComplete="family-name" required />
            </label>
          </div>
        </fieldset>

        <fieldset className="ec-groupe">
          <legend>Coordonnées</legend>
          <div className="ec-champs">
            <label className="ec-champ">
              <span>Téléphone</span>
              <input name="phone" type="tel" defaultValue={me.profile?.phone ?? ''} autoComplete="tel" inputMode="tel" />
            </label>
            <label className="ec-champ">
              <span>Ville</span>
              <input name="city" defaultValue={me.profile?.city ?? ''} autoComplete="address-level2" />
            </label>
          </div>
        </fieldset>

        <fieldset className="ec-groupe">
          <legend>Qualification</legend>
          <label className="ec-champ">
            <span>Diplôme</span>
            <input name="diploma" defaultValue={me.profile?.diploma ?? ''} placeholder="BPJEPS, DEJEPS, CQP…" />
            <small>Le diplôme qui vous permet d’encadrer contre rémunération.</small>
          </label>
        </fieldset>

        <div className="ec-formulaire__pied">
          <div aria-live="polite" className="ec-formulaire__etat">
            {err ? <p className="form-error ec-erreur">{err}</p> : null}
            {msg ? (
              <p className="ec-ok">
                <IcoCheck taille={16} />
                {msg}
              </p>
            ) : null}
            {!err && !msg && modifie ? <p className="ec-formulaire__modifie">Modifications non enregistrées</p> : null}
          </div>
          <button type="submit" className="btn ec-btn-encre" disabled={pending} aria-busy={pending}>
            {pending ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </form>

      <div className="ec-profil__cote">
        <div className="ec-carte-cote ec-entree" style={{ ['--d' as string]: 3 }}>
          <div className="ec-profil__photo">
            <span className="ec-monogramme ec-monogramme--grand" aria-hidden="true">
              {initiales}
              {photo === 'ok' ? (
                <span className="ec-monogramme__ok">
                  <IcoCheck taille={12} />
                </span>
              ) : null}
            </span>
            <div>
              <p className="ec-carte-cote__titre">Photo de profil</p>
              <p className="ec-carte-cote__texte">
                {photo === 'ok'
                  ? 'Une photo est enregistrée. En choisir une autre la remplace.'
                  : 'JPEG, PNG ou WebP, 5 Mo au plus. Elle reste privée.'}
              </p>
            </div>
          </div>
          <label className="btn btn-ghost ec-fichier" htmlFor={idPhoto} data-envoi={photo === 'envoi' || undefined}>
            <IcoPlus taille={17} />
            {photo === 'envoi' ? 'Envoi…' : photo === 'ok' ? 'Changer de photo' : 'Choisir une photo'}
            <input id={idPhoto} type="file" accept="image/jpeg,image/png,image/webp" onChange={onPhoto} />
          </label>
        </div>

        <div className="ec-carte-cote ec-entree" style={{ ['--d' as string]: 4 }}>
          <p className="ec-carte-cote__titre">Adresse e-mail</p>
          <p className="ec-carte-cote__valeur">{me.profile?.email ?? '—'}</p>
          <p className="ec-carte-cote__texte">
            Elle sert à vous identifier. Pour la changer, écrivez-nous depuis la{' '}
            <Link className="ec-lien" href="/contact">
              page contact
            </Link>
            .
          </p>
        </div>

        <div className="ec-carte-cote ec-entree" style={{ ['--d' as string]: 5 }}>
          <p className="ec-carte-cote__titre">Vos données</p>
          <p className="ec-carte-cote__texte">
            Tout ce que Boxing Center conserve sur vous, dans un fichier, quand vous voulez (RGPD).
          </p>
          <button type="button" className="btn btn-ghost" onClick={onExport}>
            <IcoDocument taille={17} />
            Télécharger mes données
          </button>
          {confirmerSuppression ? (
            <div className="ec-confirmer" role="group" aria-label="Confirmer la demande de suppression">
              <p>
                <b>Demander la suppression de votre compte ?</b> L’équipe Boxing Center traitera la demande.
              </p>
              <div className="ec-confirmer__boutons">
                <button type="button" className="btn btn-ghost" onClick={() => setConfirmerSuppression(false)}>
                  Garder mon compte
                </button>
                <button type="button" className="btn ec-btn-encre" onClick={onDeleteRequest}>
                  Oui, demander
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="ec-quitter__lien" onClick={() => setConfirmerSuppression(true)}>
              Demander la suppression de mon compte
            </button>
          )}
          <div aria-live="polite">
            {errDonnees ? <p className="form-error ec-erreur">{errDonnees}</p> : null}
            {msgDonnees ? (
              <p className="ec-ok">
                <IcoCheck taille={16} />
                {msgDonnees}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
