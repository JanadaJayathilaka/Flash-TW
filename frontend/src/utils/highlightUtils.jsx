import React from 'react';

/**
 * Checks if a string or numeric value matches the search query term.
 * Performs standard substring matching matching salesapp.
 *
 * @param {string|number} str - The target field value to check.
 * @param {string} q - The search query term.
 * @returns {boolean} - True if it matches according to rules.
 */
export function matchesSearchTerm(str, q) {
  if (str == null) return false;
  const strVal = String(str).trim().toLowerCase();
  const query = String(q).trim().toLowerCase();
  if (!query) return true;
  return strVal.includes(query);
}

/**
 * Highlights terms matching the search query inside the given text.
 * Search terms are separated by "++" matching salesapp.
 * 
 * @param {string|number} text - The input text to be highlighted.
 * @param {string} search - The search input string.
 * @returns {React.ReactNode} - React elements with matching terms wrapped in <mark> tags.
 */
export function highlightText(text, search) {
  if (text == null) return '';
  const textStr = String(text);
  if (!search || !search.trim()) return textStr;

  const rawFilter = search.trim().toLowerCase();
  const terms = rawFilter
    .split("++")
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

  return parts.map((part, i) => {
    regex.lastIndex = 0;
    return regex.test(part) ? (
      <mark key={i} className="search-highlight">
        {part}
      </mark>
    ) : (
      part
    );
  });
}

