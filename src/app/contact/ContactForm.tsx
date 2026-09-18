'use client';

import { useState } from 'react';
import { postContact } from '@/lib/api/client';
import { ApiError } from '@/lib/api/types';

export function ContactForm() {
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setOk(false);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await postContact({
        name: String(fd.get('name') || ''),
        email: String(fd.get('email') || ''),
        message: String(fd.get('message') || ''),
      });
      setOk(true);
      e.currentTarget.reset();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Envoi impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" style={{ maxWidth: 480 }} onSubmit={onSubmit}>
      <label>
        Nom
        <input name="name" required maxLength={120} autoComplete="name" />
      </label>
      <label>
        E-mail
        <input
          name="email"
          type="email"
          required
          maxLength={200}
          autoComplete="email"
        />
      </label>
      <label>
        Message
        <textarea
          name="message"
          required
          maxLength={4000}
          rows={6}
          style={{
            minHeight: 120,
            padding: '0.75rem',
            border: '1px solid var(--line)',
            borderRadius: 2,
            background: 'var(--bg-soft)',
            color: 'var(--ink)',
            font: 'inherit',
            width: '100%',
          }}
        />
      </label>
      {error ? <p className="form-error">{error}</p> : null}
      {ok ? <p className="form-ok">Message envoyé.</p> : null}
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? 'Envoi…' : 'Envoyer'}
      </button>
    </form>
  );
}
