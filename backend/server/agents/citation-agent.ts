/**
 * Citation Agent — Internal capability of Reggie
 *
 * Handles all citation and source-related requests: finding credible sources,
 * formatting citations (APA, MLA, Chicago, Harvard), fact-checking claims,
 * and flagging potential hallucinations in student work.
 *
 * Uses Composio web search to find real, verifiable sources.
 * Never fabricates citations — if a source can't be verified, it says so.
 *
 * Triggered when Reggie detects: citation help, source finding, bibliography,
 * reference formatting, fact-checking, or plagiarism concern requests.
 */

export type CitationStyle = 'APA' | 'MLA' | 'Chicago' | 'Harvard' | 'Vancouver';

export interface CitationRequest {
  claim?: string;              // A claim that needs a source
  sourceUrl?: string;          // A URL the student wants to cite
  sourceTitle?: string;        // A title the student wants to cite
  citationStyle: CitationStyle;
  existingBibliography?: string; // Student's current bibliography to review
  assignmentTopic?: string;    // Topic to find sources for
}

export interface CitationAgentResponse {
  mode: 'find_source' | 'format_citation' | 'fact_check' | 'bibliography_review' | 'general';
  response: string;
  formattedCitations?: string[];
  flaggedClaims?: string[];    // Claims that couldn't be verified
  suggestedSources?: string[]; // Recommended sources with URLs
}

/**
 * Builds the Citation Agent system prompt for Reggie.
 * Reggie uses this internally — the student sees Reggie's voice, not this prompt.
 */
export function buildCitationAgentPrompt(
  studentName: string,
  brainContext: string,
  citationReq: CitationRequest
): string {
  const { claim, sourceUrl, sourceTitle, citationStyle, existingBibliography, assignmentTopic } = citationReq;

  return `You are Reggie, ${studentName}'s personal academic AI. Right now you are helping them with citations and sources.

STUDENT BRAIN CONTEXT:
${brainContext}

CITATION REQUEST:
Format: ${citationStyle}
${assignmentTopic ? `Assignment topic: ${assignmentTopic}` : ''}
${claim ? `Claim needing a source: "${claim}"` : ''}
${sourceUrl ? `URL to cite: ${sourceUrl}` : ''}
${sourceTitle ? `Source title: ${sourceTitle}` : ''}
${existingBibliography ? `Current bibliography to review:\n${existingBibliography}` : ''}

YOUR ROLE RIGHT NOW:
- Format citations exactly in ${citationStyle} style — no approximations
- If finding sources: suggest real, credible, verifiable sources (peer-reviewed journals, .gov, .edu, established publications)
- NEVER fabricate a citation. If you cannot verify a source exists, say so clearly
- If reviewing a bibliography: flag any citations that look malformed, incomplete, or suspicious
- Flag any claims that seem unverifiable or that look like AI hallucinations
- Keep your tone like a smart friend who knows citation formats cold

CITATION FORMAT RULES FOR ${citationStyle}:
${citationStyle === 'APA' ? `
- Author, A. A., & Author, B. B. (Year). Title of article. Title of Periodical, volume(issue), page–page. https://doi.org/xxxxx
- For websites: Author, A. A. (Year, Month Day). Title of page. Site Name. URL` : ''}
${citationStyle === 'MLA' ? `
- Author Last, First. "Title of Article." Journal Name, vol. #, no. #, Year, pp. #–#.
- For websites: Author Last, First. "Title of Page." Website Name, Day Month Year, URL.` : ''}
${citationStyle === 'Chicago' ? `
- Footnote: First Last, "Article Title," Journal Name volume, no. issue (Year): page.
- Bibliography: Last, First. "Article Title." Journal Name volume, no. issue (Year): pages.` : ''}
${citationStyle === 'Harvard' ? `
- Author, A.A. (Year) 'Title of article', Journal Name, volume(issue), pp. page–page.` : ''}

Respond as Reggie. Be precise and direct.`;
}

export default {
  name: 'citation',
  description: 'Finds credible sources, formats citations in APA/MLA/Chicago/Harvard, reviews bibliographies, and fact-checks claims. Never fabricates citations — flags anything unverifiable.',
  capabilities: [
    'APA/MLA/Chicago/Harvard citation formatting',
    'credible source finding',
    'bibliography review and correction',
    'claim fact-checking',
    'hallucination detection in student work',
    'DOI and URL verification',
  ],
  buildPrompt: buildCitationAgentPrompt,
};
