/**
 * Legal Link Generator
 * Generates valid, working search URLs for Indian legal databases
 * 
 * NOTE: These are SEARCH links, not direct case links, because:
 * 1. Direct case URLs require specific database IDs we don't have
 * 2. Search links are more reliable and will work even if citation format varies
 * 3. Users can verify the actual case themselves
 */

export interface LegalDatabaseLink {
  name: string;
  url: string;
  isFree: boolean;
  description: string;
}

/**
 * Encode search query for URL
 */
function encodeSearchQuery(query: string): string {
  return encodeURIComponent(query.trim());
}

/**
 * Clean citation for better search results
 * Removes parentheses and special characters that might break searches
 */
function cleanCitationForSearch(citation: string): string {
  return citation
    .replace(/\(|\)/g, '') // Remove parentheses
    .replace(/\s+/g, ' ')  // Normalize spaces
    .trim();
}

/**
 * Generate search URLs for Indian legal databases
 * Returns verified, working search URLs for major Indian legal databases
 */
export function generateLegalDatabaseLinks(citation: string, caseName?: string): LegalDatabaseLink[] {
  const links: LegalDatabaseLink[] = [];
  
  // Clean the citation for search
  const searchQuery = caseName 
    ? `${caseName} ${cleanCitationForSearch(citation)}`
    : cleanCitationForSearch(citation);
  
  const encodedQuery = encodeSearchQuery(searchQuery);
  const encodedCitation = encodeSearchQuery(cleanCitationForSearch(citation));
  
  // 1. Indian Kanoon (FREE - Most reliable for Indian cases)
  links.push({
    name: 'Indian Kanoon',
    url: `https://indiankanoon.org/search/?formInput=${encodedQuery}`,
    isFree: true,
    description: 'Free comprehensive Indian legal database'
  });
  
  // 2. Supreme Court of India - Official (FREE)
  if (citation.toLowerCase().includes('sc') || citation.toLowerCase().includes('scc')) {
    links.push({
      name: 'Supreme Court of India',
      url: `https://main.sci.gov.in/judgments`,
      isFree: true,
      description: 'Official Supreme Court judgments portal'
    });
  }
  
  // 3. Google Scholar - Legal (FREE)
  links.push({
    name: 'Google Scholar',
    url: `https://scholar.google.com/scholar?q=${encodedQuery}+india+court`,
    isFree: true,
    description: 'Academic and legal document search'
  });
  
  // 4. SCC Online (Subscription required - but widely used)
  links.push({
    name: 'SCC Online',
    url: `https://www.scconline.com/Members/SearchResult.aspx?search=${encodedCitation}`,
    isFree: false,
    description: 'Premium legal database (subscription required)'
  });
  
  // 5. Manupatra (Subscription required)
  links.push({
    name: 'Manupatra',
    url: `https://www.manupatrafast.com/Search/SearchResult.aspx?searchText=${encodedCitation}`,
    isFree: false,
    description: 'Premium legal database (subscription required)'
  });
  
  // 6. eCourts (FREE - Government portal)
  links.push({
    name: 'eCourts India',
    url: 'https://ecourts.gov.in/ecourts_home/',
    isFree: true,
    description: 'Official government case status portal'
  });
  
  return links;
}

/**
 * Get the best free link for a citation
 * Prioritizes free, reliable databases
 */
export function getBestFreeLink(citation: string, caseName?: string): LegalDatabaseLink {
  const links = generateLegalDatabaseLinks(citation, caseName);
  return links.find(link => link.isFree) || links[0];
}

/**
 * Open citation in legal database
 * Opens Indian Kanoon search by default (most reliable free option)
 */
export function openCitationInDatabase(citation: string, caseName?: string, preferredDatabase?: string): void {
  const links = generateLegalDatabaseLinks(citation, caseName);
  
  let linkToOpen: LegalDatabaseLink;
  
  if (preferredDatabase) {
    linkToOpen = links.find(l => l.name.toLowerCase().includes(preferredDatabase.toLowerCase())) || links[0];
  } else {
    // Default to Indian Kanoon (free and comprehensive)
    linkToOpen = links[0];
  }
  
  window.open(linkToOpen.url, '_blank', 'noopener,noreferrer');
}

/**
 * Validate if a citation looks legitimate
 * Returns false for obviously fabricated citations
 */
export function isValidCitationFormat(citation: string): boolean {
  if (!citation || typeof citation !== 'string') return false;
  
  // Check for common Indian citation patterns
  const validPatterns = [
    /\(\d{4}\)\s*\d+\s*(SCC|SCR|AIR|Bom|Del|Mad|Cal|Kar|All)/i,  // (2023) 5 SCC 123
    /AIR\s*\d{4}\s*(SC|Bom|Del|Mad|Cal|Kar|All)/i,               // AIR 2023 SC 123
    /\d{4}\s*(SCC|SCR)\s*\d+/i,                                   // 2023 SCC 5
    /\[\d{4}\]\s*\d+\s*(SCR|SCC)/i,                               // [2023] 5 SCR
    /W\.?P\.?\s*\(C\)?\s*No\.?\s*\d+/i,                           // Writ Petition numbers
    /CRL\.?A\.?\s*No\.?\s*\d+/i,                                  // Criminal Appeal numbers
    /SLP\s*\(C\)?\s*No\.?\s*\d+/i,                                // Special Leave Petition
  ];
  
  return validPatterns.some(pattern => pattern.test(citation));
}

/**
 * Get a disclaimer message for AI-generated citations
 */
export function getCitationDisclaimer(isAISynthesis?: boolean): string {
  if (isAISynthesis) {
    return '⚠️ This citation was AI-generated and may need verification. Please search the official databases to confirm accuracy.';
  }
  return 'Please verify this citation from official legal databases before relying on it in court.';
}

