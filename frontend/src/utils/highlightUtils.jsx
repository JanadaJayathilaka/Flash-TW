import React from 'react';

/**
 * Checks if a string or numeric value matches the search query term.
 * If the term is numeric, it only matches if the number ends with the term (right-side digits).
 * If the term is non-numeric, it performs a standard substring match.
 *
 * @param {string|number} str - The target field value to check.
 * @param {string} q - The search query term.
 * @returns {boolean} - True if it matches according to rules.
 */
export function matchesSearchTerm(str, q) {
  if (str == null) return false;
  const strVal = String(str).trim();
  const query = q.trim().toLowerCase();
  if (!query) return true;

  const isNumericTerm = /^\d+$/.test(query);

  if (!isNumericTerm) {
    return strVal.toLowerCase().includes(query);
  }

  // Pure digits query (e.g. "241"):
  // 1. If strVal stripped of commas/spaces is pure digits (e.g. "134,241" -> "134241", "241", "121241"):
  const stripped = strVal.replace(/[,\s]/g, "");
  if (/^\d+$/.test(stripped)) {
    return stripped.endsWith(query);
  }

  // 2. If strVal contains text and digits (e.g. "Store 121241" or "First Sale '22/01/2015"):
  const digitSequences = strVal.match(/\d+/g);
  if (digitSequences) {
    return digitSequences.some((seq) => seq.endsWith(query));
  }

  return false;
}

/**
 * Highlights terms matching the search query inside the given text.
 * Search terms can be separated by "++".
 * If a search term is numeric, it will only highlight the right-side digits (suffix) of numbers.
 * 
 * @param {string|number} text - The input text to be highlighted.
 * @param {string} search - The search input string.
 * @returns {React.ReactNode} - React elements with matching terms wrapped in <mark> tags.
 */
export function highlightText(text, search) {
  if (text == null) return '';
  const textStr = String(text);
  if (!search || !search.trim()) return textStr;

  const terms = (
    search.includes("++")
      ? search.toLowerCase().split("++")
      : search.toLowerCase().split(/\s+/)
  )
    .map((s) => s.trim())
    .filter(Boolean);

  if (terms.length === 0) return textStr;

  // Escape special regex characters to avoid invalid patterns
  const escapedTerms = terms
    .map((term) => term.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'))
    .filter(Boolean);

  if (escapedTerms.length === 0) return textStr;

  const makeTermPattern = (term) => {
    const isNumeric = /^\d+$/.test(term);
    const flexible = term.split('').map((char, index, arr) => {
      if (/\d/.test(char) && index < arr.length - 1 && /\d/.test(arr[index + 1])) {
        return char + '[,\\s]?';
      }
      return char;
    }).join('');

    if (isNumeric) {
      // Must match at the end of the number (right-side digits only, not followed by another digit)
      return `${flexible}(?!\\d)`;
    }
    return flexible;
  };

  const flexibleTerms = escapedTerms.map(makeTermPattern);

  const regex = new RegExp(`(${flexibleTerms.join('|')})`, 'gi');
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
