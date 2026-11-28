/**
 * Une biographie ou une présentation servie par le serveur, ramenée à des
 * paragraphes de TEXTE BRUT : balises retirées, entités courantes décodées.
 * Nocturne n'injecte jamais de HTML venu d'une source tierce.
 */
export function paragraphes(texte: string | null | undefined): string[] {
  if (!texte) return [];
  const brut = texte
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
  return brut.split(/\n\s*\n|\r\n\s*\r\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
}
