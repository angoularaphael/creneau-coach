import type { Metadata } from 'next';
import { ContactForm } from './ContactForm';

export const metadata: Metadata = { title: 'Contact' };

export default function ContactPage() {
  return (
    <>
      <header className="page-hero">
        <h1>Contact</h1>
        <p>
          Formulaire <code>POST /contact</code> (rate limit 5 / h). Mail
          transactionnel = Lot Raphael.
        </p>
      </header>
      <section className="section" style={{ paddingTop: 0 }}>
        <ContactForm />
      </section>
    </>
  );
}
