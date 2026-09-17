/**
 * Matching logic ported 1:1 from the reference matcher:
 * postcode extraction → address token windows → overlap scoring
 * → multi-page invoice grouping → best-label selection.
 */

export interface PdfTextPage {
  pageIndex: number;
  pageNumber: number;
  text: string;
  postcodes: string[];
  matchTokens: Set<string>;
}

export interface InvoiceGroup {
  orderNumber: number;
  startPageNumber: number;
  pageIndices: number[];
  postcodes: string[];
  startPageText: string;
  matchTokens: Set<string>;
}

export interface LabelMatch {
  labelIndex: number;
  postcode: string;
  score: number;
  ambiguousResolvedByOrder?: boolean;
}

/** UK postcode regex (full official pattern). */
const POSTCODE_REGEX =
  /([Gg][Ii][Rr] 0[Aa]{2})|((([A-Za-z][0-9]{1,2})|(([A-Za-z][A-Ha-hJ-Yj-y][0-9]{1,2})|(([A-Za-z][0-9][A-Za-z])|([A-Ha-hJ-Yj-y][0-9][A-Za-z]?))))\s?[0-9][A-Za-z]{2})/g;

export function extractPostcodes(text: string): string[] {
  const matches = text.match(POSTCODE_REGEX);
  return matches
    ? [...new Set(matches.map((p) => p.toUpperCase().replace(/\s+/g, "")))]
    : [];
}

/** "SW1A1AA" → "SW1A 1AA" (inward code is always the last 3 chars). */
export function prettyPostcode(compact: string): string {
  if (compact.length <= 3) return compact;
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
}

export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeText(text: string): string {
  return (text || "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const MATCH_STOPWORDS = new Set([
  "RAJANI",
  "SUPERSTORE",
  "TEMU",
  "EVRI",
  "UNITED",
  "KINGDOM",
  "RETURNS",
  "REFUNDS",
  "RESENDS",
  "POSTAGE",
  "TOTAL",
  "TAX",
  "VAT",
  "ITEM",
  "SKU",
  "LINE",
  "COST",
  "DATE",
  "DROP",
  "ROUND",
  "CO",
  "GB",
]);

export function tokenizeForMatch(text: string): string[] {
  const tokens = normalizeText(text).match(/[A-Z0-9]+/g) || [];
  return tokens.filter((token) => {
    if (token.length < 3) return false;
    if (/^\d+$/.test(token)) return false;
    if (MATCH_STOPWORDS.has(token)) return false;
    return true;
  });
}

/**
 * Collects meaningful address/name tokens from a window of ±140 chars
 * around each postcode occurrence, with a tail-of-page fallback.
 */
export function extractAddressTokensNearPostcodes(
  text: string,
  postcodes: string[],
): Set<string> {
  const normalized = normalizeText(text);
  const collected = new Set<string>();

  postcodes.forEach((pc) => {
    const compact = pc.replace(/\s+/g, "").toUpperCase();
    if (compact.length < 5) return;
    const outcode = compact.slice(0, -3);
    const incode = compact.slice(-3);
    const pattern = new RegExp(
      `${escapeRegex(outcode)}\\s*${escapeRegex(incode)}`,
      "g",
    );

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(normalized)) !== null) {
      const start = Math.max(0, match.index - 140);
      const end = Math.min(normalized.length, match.index + match[0].length + 140);
      const windowText = normalized.slice(start, end);
      tokenizeForMatch(windowText).forEach((token) => collected.add(token));
    }
  });

  // Fallback: if the postcode window produced too little evidence,
  // sample tokens from the end of the document (address blocks usually sit there).
  if (collected.size < 2) {
    tokenizeForMatch(normalized)
      .slice(-30)
      .forEach((token) => collected.add(token));
  }

  return collected;
}

export function computeTokenOverlapScore(a: Set<string>, b: Set<string>): number {
  let score = 0;
  a.forEach((token) => {
    if (b.has(token)) score += 1;
  });
  return score;
}

/**
 * Picks the best unused label for an invoice group:
 *  - candidates share at least one postcode,
 *  - ranked by address/name token overlap,
 *  - zero-evidence matches are rejected (fail safe),
 *  - equal-score ties resolve first-come-first-serve by label page order.
 */
export function findBestLabelForGroup(
  group: InvoiceGroup,
  labelsData: PdfTextPage[],
  postcodeToLabelIndices: Map<string, number[]>,
  usedLabelPages: Set<number>,
): LabelMatch | null {
  const candidates: LabelMatch[] = [];

  group.postcodes.forEach((pc) => {
    const candidateIndices = postcodeToLabelIndices.get(pc) || [];
    candidateIndices.forEach((labelIndex) => {
      if (usedLabelPages.has(labelIndex)) return;
      const labelPage = labelsData[labelIndex];
      if (!labelPage) return;
      const score = computeTokenOverlapScore(group.matchTokens, labelPage.matchTokens);
      candidates.push({ labelIndex, postcode: pc, score });
    });
  });

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  candidates.sort((a, b) => b.score - a.score || a.labelIndex - b.labelIndex);
  const best = candidates[0];
  const second = candidates[1];

  // Fail safe when there is zero address/name evidence.
  if (best.score === 0) return null;

  if (second && best.score === second.score) {
    best.ambiguousResolvedByOrder = true;
  }

  return best;
}

/**
 * Groups invoice pages into orders so a multi-page invoice
 * ("...continues on the next page") receives exactly ONE label,
 * placed right after its final invoice page.
 */
export function buildInvoiceGroups(invoicesData: PdfTextPage[]): InvoiceGroup[] {
  const groups: InvoiceGroup[] = [];
  let lastPageWasContinued = false;

  invoicesData.forEach((pageData) => {
    const text = pageData.text || "";
    const hasPostcode = pageData.postcodes.length > 0;
    const isContinued = /continues on the next page/i.test(text);

    // If the PREVIOUS page was marked as continued, this page is part of the same order.
    if (lastPageWasContinued && groups.length > 0) {
      const currentGroup = groups[groups.length - 1];
      currentGroup.pageIndices.push(pageData.pageIndex);
      lastPageWasContinued = isContinued;
      return;
    }

    if (hasPostcode || !groups.length) {
      groups.push({
        orderNumber: groups.length + 1,
        startPageNumber: pageData.pageNumber,
        pageIndices: [pageData.pageIndex],
        postcodes: [...pageData.postcodes],
        startPageText: pageData.text,
        matchTokens: new Set<string>(),
      });
    } else {
      // Fallback: keep unmarked pages attached to the previous order.
      groups[groups.length - 1].pageIndices.push(pageData.pageIndex);
    }

    lastPageWasContinued = isContinued;
  });

  return groups;
}
