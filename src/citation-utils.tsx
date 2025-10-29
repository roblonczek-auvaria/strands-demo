// Citation parsing and rendering utilities
import React from 'react';

export interface Citation {
  id: string;
  number: number;
}

const CITATION_PATTERNS = [
  /%\[(\d+)\]%/g,                // %[1]% style
] as const;

function getCitationRegex(): RegExp {
  return /%\[(\d+)\]%/g;
}

function extractCitationNumber(match: RegExpExecArray): number {
  for (let i = 1; i < match.length; i += 1) {
    const group = match[i];
    if (group != null) {
      const num = Number(group);
      if (Number.isFinite(num)) {
        return num;
      }
    }
  }
  return NaN;
}

export function parseCitations(text: string): { citations: Citation[]; cleanText: string } {
  const found = new Set<number>();
  const citations: Citation[] = [];

  for (const pattern of CITATION_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const num = Number(match[1]);
      if (Number.isFinite(num) && !found.has(num)) {
        found.add(num);
        citations.push({
          id: `citation-${num}`,
          number: num
        });
      }
    }
  }

  citations.sort((a, b) => a.number - b.number);
  return { citations, cleanText: text };
}

function buildCitationSup(
  citationNumber: number,
  onCitationClick: ((citationNumber: number) => void) | undefined,
  key: string
) {
  const isInteractive = typeof onCitationClick === 'function';
  const activateCitation = () => {
    if (isInteractive) {
      onCitationClick?.(citationNumber);
    }
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!isInteractive) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onCitationClick?.(citationNumber);
    }
  };

  return (
    <sup
      key={key}
      className="citation-link"
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      aria-label={isInteractive ? `Reference ${citationNumber}` : undefined}
      data-citation-number={citationNumber}
      onClick={isInteractive ? activateCitation : undefined}
      onKeyDown={handleKeyDown}
      title={`Reference ${citationNumber}`}
    >
      [{citationNumber}]
    </sup>
  );
}

export function renderTextWithCitations(
  text: string,
  onCitationClick?: (citationNumber: number) => void,
  keyPrefix = 'citation'
): React.ReactNode[] {
  if (!text || typeof text !== 'string') {
    return [text];
  }

  const parts: React.ReactNode[] = [];
  const pattern = getCitationRegex();
  pattern.lastIndex = 0;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let segment = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const citationNumber = extractCitationNumber(match);
    if (Number.isFinite(citationNumber)) {
      parts.push(buildCitationSup(citationNumber, onCitationClick, `${keyPrefix}-${segment++}-${citationNumber}`));
    } else {
      parts.push(match[0]);
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}
