/**
 * getDisplayName
 *
 * Derive a friendly display name from an email address.
 * Strips `+suffix` aliases (e.g. `dicoangelo+dev@…` → `dicoangelo`)
 * before taking the local part and capitalizing the first letter.
 *
 * Examples:
 *   getDisplayName('dicoangelo+dev@metaventionsai.com') → 'Dicoangelo'
 *   getDisplayName('jane.doe@example.com')             → 'Jane.doe'
 *   getDisplayName(null)                               → 'Investor'
 */
export function getDisplayName(email: string | undefined | null): string {
  if (!email) return 'Investor';

  // Strip everything from the first `+` to the `@`, e.g. `name+anything@host` → `name@host`.
  const sanitized = email.replace(/\+[^@]*(?=@)/, '');

  const local = sanitized.split('@')[0];
  if (!local) return 'Investor';

  // Capitalize first letter (preserve existing convention).
  return local.charAt(0).toUpperCase() + local.slice(1);
}
