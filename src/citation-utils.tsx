// Citation parsing and rendering utilities
import React from 'react';

export interface Citation {
  id: string;
  number: number;
}

/**
 * Parses citation patterns like %[1]%, %[2]%, etc. from text
 * Deduplicates citations so each document is only cited once
 */
export function parseCitations(text: string): { citations: Citation[]; cleanText: string } {
  const citationPattern = /%\[(\d+)\]%/g;
  const foundCitations = new Set<number>();
  const citations: Citation[] = [];
  
  // Find all unique citation numbers
  let match;
  while ((match = citationPattern.exec(text)) !== null) {
    const number = parseInt(match[1], 10);
    if (!foundCitations.has(number)) {
      foundCitations.add(number);
      citations.push({
        id: `citation-${number}`,
        number
      });
    }
  }
  
  // Sort citations by number for consistent ordering
  citations.sort((a, b) => a.number - b.number);
  
  // Replace citation patterns with placeholder markers
  let cleanText = text.replace(citationPattern, (_, num) => `__CITATION_${num}__`);
  
  return { citations, cleanText };
}

/**
 * Renders text with citation superscripts
 * Returns JSX elements with clickable citation superscripts
 */
export function renderTextWithCitations(
  text: string, 
  onCitationClick?: (citationNumber: number) => void
): React.ReactNode[] {
  const { citations, cleanText } = parseCitations(text);
  
  if (citations.length === 0) {
    return [text];
  }
  
  // Create a set of unique citation numbers for deduplication
  // but keep original numbers for display
  const uniqueCitations = new Set<number>();
  citations.forEach(citation => {
    uniqueCitations.add(citation.number);
  });
  
  // Split text by citation placeholders and render with superscripts
  const parts: React.ReactNode[] = [];
  let remainingText = cleanText;
  let partIndex = 0;
  
  // Replace placeholders with actual superscript elements
  const citationPlaceholderPattern = /__CITATION_(\d+)__/g;
  let lastIndex = 0;
  let match;
  
  while ((match = citationPlaceholderPattern.exec(remainingText)) !== null) {
    const beforeText = remainingText.slice(lastIndex, match.index);
    const citationNumber = parseInt(match[1], 10);
    
    if (beforeText) {
      parts.push(beforeText);
    }
    
    // Use the original citation number for display
    parts.push(
      <sup
        key={`citation-${citationNumber}-${partIndex++}`}
        className="citation-link"
        onClick={() => onCitationClick?.(citationNumber)}
        title={`Reference ${citationNumber}`}
      >
        {citationNumber}
      </sup>
    );
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add any remaining text after the last citation
  if (lastIndex < remainingText.length) {
    parts.push(remainingText.slice(lastIndex));
  }
  
  return parts;
}