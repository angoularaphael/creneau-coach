import type { Metadata } from 'next';
import { ContactForm } from './ContactForm';

export const metadata: Metadata = { title: 'Contact' };

export default function ContactPage() {
  return (
    <>
      <header className="page-hero page-hero--visuel" data-visuel="contact">
        <h1>Contact</h1>
        <p>
          Formulaire <code>POST /contact</code> (rate limit 5 / h). Mail
          transactionnel = Lot Raphael.
        </p>
      </header>
      <section className="section">
        <ContactForm />
      </section>
    </>
  );
}
