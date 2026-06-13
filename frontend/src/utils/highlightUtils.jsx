import React from 'react';

/**
 * Highlights terms matching the search query inside the given text.
 * Search terms can be separated by "++".
 * 
 * @param {string|number} text - The input text to be highlighted.
 * @param {string} search - The search input string.
 * @returns {React.ReactNode} - React elements with matching terms wrapped in <mark> tags.
 */
export function highlightText(text, search) {
  if (text == null) return '';
  const textStr = String(text);
  if (!search || !search.trim()) return textStr;

  const terms = search
    .toLowerCase()
    .split('++')
    .map((s) => s.trim())
    .filter(Boolean);

  if (terms.length === 0) return textStr;

  // Escape special regex characters to avoid invalid patterns
  const escapedTerms = terms
    .map((term) => term.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'))
    .filter(Boolean);

  if (escapedTerms.length === 0) return textStr;

  const regex = new RegExp(`(${escapedTerms.join('|')})`, 'gi');
  const parts = textStr.split(regex);

  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="search-highlight">
        {part}
      </mark>
    ) : (
      part
    )
  );
}
