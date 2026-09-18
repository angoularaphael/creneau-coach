/** Mot de passe robuste — Lot B §2.2 */
export function validatePassword(password: string): string | null {
  if (password.length < 12) {
    return 'Le mot de passe doit contenir au moins 12 caractères.';
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) {
    return 'Le mot de passe doit contenir majuscules et minuscules.';
  }
  if (!/[0-9]/.test(password)) {
    return 'Le mot de passe doit contenir au moins un chiffre.';
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return 'Le mot de passe doit contenir au moins un caractère spécial.';
  }
  return null;
}
