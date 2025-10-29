import React from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import { renderTextWithCitations } from './citation-utils';

interface TextWithCitationsProps {
  text: string;
  className?: string;
  onCitationClick?: (citationNumber: number) => void;
  renderMarkdown?: boolean;
}

// Helper function to convert citation patterns to markdown links
function preprocessCitationsForMarkdown(text: string): string {
  // Replace %[N]% patterns with markdown links that we can catch later
  // Use a hash link to prevent navigation issues
  return text.replace(/%\[(\d+)\]%/g, '[$1](#citation-$1)');
}

export function TextWithCitations({ 
  text, 
  className = '', 
  onCitationClick,
  renderMarkdown = false
}: TextWithCitationsProps) {
  const safeText = text || '';

  const markdownComponents = React.useMemo<Components>(() => ({
    a({ node: _node, href, children, ...props }) {
      // Check if this is one of our citation links
      if (href && href.startsWith('#citation-')) {
        const citationNumber = parseInt(href.replace('#citation-', ''), 10);
        if (!isNaN(citationNumber)) {
          const isInteractive = typeof onCitationClick === 'function';
          const activateCitation = (e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (isInteractive) {
              onCitationClick?.(citationNumber);
            }
          };
          const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
            if (!isInteractive) return;
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              onCitationClick?.(citationNumber);
            }
          };

          return (
            <sup
              className="citation-link"
              role={isInteractive ? 'button' : undefined}
              tabIndex={isInteractive ? 0 : undefined}
              aria-label={isInteractive ? `Reference ${citationNumber}` : undefined}
              data-citation-number={citationNumber}
              onClick={isInteractive ? activateCitation : undefined}
              onKeyDown={handleKeyDown}
              title={`Reference ${citationNumber}`}
              style={{ cursor: isInteractive ? 'pointer' : 'default' }}
            >
              [{citationNumber}]
            </sup>
          );
        } else {
          // Citation hash but invalid number - prevent navigation
          return (
            <span className="citation-link citation-error" title="Invalid citation">
              {children}
            </span>
          );
        }
      }
      
      // For any other links that aren't citations, check if they're valid URLs
      // If not, render as plain text to prevent navigation issues
      if (href && !href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('mailto:')) {
        return <span>{children}</span>;
      }
      
      // Regular external link
      return <a {...props} href={href} target="_blank" rel="noreferrer">{children}</a>;
    }
  }), [onCitationClick]);

  if (!renderMarkdown) {
    const renderedContent = renderTextWithCitations(safeText, onCitationClick);
    return (
      <div className={className}>
        {renderedContent}
      </div>
    );
  }

  // Preprocess the text to convert citations to markdown links
  const preprocessedText = preprocessCitationsForMarkdown(safeText);

  return (
    <div className={className}>
      <ReactMarkdown components={markdownComponents}>
        {preprocessedText}
      </ReactMarkdown>
    </div>
  );
}

function flattenToString(children: React.ReactNode): string | null {
  if (children == null) return null;
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) {
    let result = '';
    for (const child of children) {
      const value = flattenToString(child);
      if (value == null) {
        return null;
      }
      result += value;
    }
    return result;
  }
  return null;
}
