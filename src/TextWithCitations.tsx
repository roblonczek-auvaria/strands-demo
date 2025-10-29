import React from 'react';
import { renderTextWithCitations } from './citation-utils';

interface TextWithCitationsProps {
  text: string;
  className?: string;
  onCitationClick?: (citationNumber: number) => void;
}

export function TextWithCitations({ 
  text, 
  className = '', 
  onCitationClick 
}: TextWithCitationsProps) {
  const renderedContent = renderTextWithCitations(text, onCitationClick);
  
  return (
    <div className={className}>
      {renderedContent}
    </div>
  );
}