import React from 'react';

/**
 * Renders plain text with preserved paragraph breaks.
 *
 * - Splits on blank lines (\n\n or more) to produce separate <p> elements.
 * - Splits on single \n to produce <br> within a paragraph.
 * - Intermediate paragraphs use { ...style, marginBottom: spacing }.
 * - The last paragraph uses style as-is (preserving any marginBottom the
 *   caller set for spacing after the whole block).
 */
export default function FormattedText({ text, style, spacing = '14px' }) {
  if (!text) return null;
  const paras = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  if (!paras.length) return null;
  return (
    <>
      {paras.map((para, i) => {
        const isLast = i === paras.length - 1;
        const pStyle = isLast ? style : { ...style, marginBottom: spacing };
        const lines = para.split('\n');
        return (
          <p key={i} style={pStyle}>
            {lines.map((line, j) => (
              <React.Fragment key={j}>
                {j > 0 && <br />}
                {line}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </>
  );
}
