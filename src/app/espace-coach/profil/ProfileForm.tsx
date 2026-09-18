'use client';

import { useState } from 'react';
import type { Me, ProfilePatch } from '@/lib/api/types';

export function ProfileForm({ me }: { me: Me }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
        setErr(body?.error?.message || 'Mise à jour impossible.');
      } else {
        setMsg('Profil enregistré.');
      }
    } catch {
      setErr('Erreur réseau.');
    } finally {
      setPending(false);
    }
  }

  async function onExport() {
    setErr(null);
    const res = await fetch('/api/v1/me/export', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      setErr('Export impossible.');
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
  }

  async function onDeleteRequest() {
    if (!window.confirm('Demander la suppression de votre compte ?')) return;
    const res = await fetch('/api/v1/me', {
      method: 'DELETE',
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (res.status === 202) {
      setMsg('Demande de suppression enregistrée (202).');
    } else {
      setErr('Demande refusée.');
    }
  }

  return (
    <div className="auth-form" style={{ maxWidth: 480 }}>
      <form onSubmit={onSubmit} className="auth-form">
        <label>
          Prénom
          <input
            name="first_name"
            defaultValue={me.profile?.first_name ?? ''}
            required
          />
        </label>
        <label>
          Nom
          <input
            name="last_name"
            defaultValue={me.profile?.last_name ?? ''}
            required
          />
        </label>
        <label>
          Téléphone
          <input name="phone" defaultValue={me.profile?.phone ?? ''} />
        </label>
        <label>
          Ville
          <input name="city" defaultValue={me.profile?.city ?? ''} />
        </label>
        <label>
          Diplôme
          <input name="diploma" defaultValue={me.profile?.diploma ?? ''} />
        </label>
        {err ? <p className="form-error">{err}</p> : null}
        {msg ? <p className="form-ok">{msg}</p> : null}
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </form>

      <div style={{ marginTop: '2rem', display: 'grid', gap: '0.75rem' }}>
        <label>
          Photo privée (jpeg/png/webp, max 5 Mo)
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setErr(null);
              setMsg(null);
              const fd = new FormData();
              fd.set('file', file);
              const res = await fetch('/api/v1/me/photo', {
                method: 'POST',
                credentials: 'same-origin',
                body: fd,
              });
              const body = await res.json().catch(() => null);
              if (!res.ok) {
                setErr(body?.error?.message || 'Upload refusé.');
              } else {
                setMsg(`Photo enregistrée (path privé : ${body.photo_path}).`);
              }
            }}
          />
        </label>
        {me.profile?.photo_path ? (
          <p className="field-hint">Path actuel : {me.profile.photo_path}</p>
        ) : null}
        <button type="button" className="btn btn-ghost" onClick={onExport}>
          Exporter mes données (RGPD)
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDeleteRequest}>
          Demander la suppression
        </button>
      </div>
    </div>
  );
}
