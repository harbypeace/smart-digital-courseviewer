'use client';

import { useRef, useState, useLayoutEffect, useMemo } from 'react';
import type { PPTLatexElement } from '@openmaic/dsl';

import { mathjax } from 'mathjax-full/js/mathjax';
import { TeX } from 'mathjax-full/js/input/tex';
import { SVG } from 'mathjax-full/js/output/svg';
import { browserAdaptor } from 'mathjax-full/js/adaptors/browserAdaptor';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html';
import 'mathjax-full/js/input/tex/base/BaseConfiguration';
import 'mathjax-full/js/input/tex/ams/AmsConfiguration';
import 'mathjax-full/js/input/tex/noundefined/NoUndefinedConfiguration';
import 'mathjax-full/js/input/tex/boldsymbol/BoldsymbolConfiguration';
import 'mathjax-full/js/input/tex/html/HtmlConfiguration';

let htmlDocs: any = null;

function getMathJax() {
  if (!htmlDocs && typeof window !== 'undefined') {
    const adaptor = browserAdaptor();
    RegisterHTMLHandler(adaptor);
    const tex = new TeX({ packages: ['base', 'ams', 'noundefined', 'boldsymbol', 'html'] });
    const svg = new SVG({ fontCache: 'local' });
    htmlDocs = mathjax.document(document, { InputJax: tex, OutputJax: svg });
  }
  return htmlDocs;
}

export interface BaseLatexElementProps {
  elementInfo: PPTLatexElement;
}

export function BaseLatexElement({ elementInfo }: BaseLatexElementProps) {
  // Try to render mathjax
  const mathHtml = useMemo(() => {
    try {
      const doc = getMathJax();
      if (!doc || !elementInfo.latex) return elementInfo.html;
      const node = doc.convert(elementInfo.latex, { display: true });
      return node.innerHTML;
    } catch (e) {
      console.warn("MathJax render failed", e);
      return elementInfo.html;
    }
  }, [elementInfo.latex, elementInfo.html]);

  return (
    <div
      className="base-element-latex"
      style={{
        position: 'absolute',
        top: `${elementInfo.top}px`,
        left: `${elementInfo.left}px`,
        width: `${elementInfo.width}px`,
        height: `${elementInfo.height}px`,
      }}
    >
      <div
        className="rotate-wrapper"
        style={{
          width: '100%',
          height: '100%',
          transform: `rotate(${elementInfo.rotate}deg)`,
        }}
      >
        <div
          className="element-content"
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            ...(elementInfo.color ? { color: elementInfo.color } : {}),
            fill: elementInfo.color || 'currentColor', // SVG inherits fill
            fontFamily: "'Amiri', serif",
          }}
        >
          {mathHtml ? (
            <MathContent
              html={mathHtml}
              width={elementInfo.width}
              height={elementInfo.height}
              align={elementInfo.align}
            />
          ) : elementInfo.path && elementInfo.viewBox ? (
            <svg
              overflow="visible"
              width={elementInfo.width}
              height={elementInfo.height}
              stroke={elementInfo.color}
              strokeWidth={elementInfo.strokeWidth}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ transformOrigin: '0 0', overflow: 'visible' }}
            >
              <g
                transform={`scale(${elementInfo.width / elementInfo.viewBox[0]}, ${
                  elementInfo.height / elementInfo.viewBox[1]
                }) translate(0,0) matrix(1,0,0,1,0,0)`}
              >
                <path d={elementInfo.path} />
              </g>
            </svg>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const ALIGN_MAP = {
  left: 'flex-start',
  center: 'center',
  right: 'flex-end',
} as const;

function MathContent({
  html,
  width,
  height,
  align = 'center',
}: {
  html: string;
  width: number;
  height: number;
  align?: 'left' | 'center' | 'right';
}) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    if (!innerRef.current) return;
    const naturalW = innerRef.current.scrollWidth;
    const naturalH = innerRef.current.scrollHeight;
    if (naturalW > 0 && naturalH > 0) {
      setScale(Math.min(width / naturalW, height / naturalH, 1));
    }
  }, [html, width, height]);

  const justify = ALIGN_MAP[align];
  const origin = align === 'left' ? 'left center' : align === 'right' ? 'right center' : 'center center';

  return (
    <div
      style={{
        width,
        height,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: justify,
      }}
    >
      <div
        ref={innerRef}
        className="slide-renderer-prose"
        style={{
          transformOrigin: origin,
          transform: `scale(${scale})`,
          whiteSpace: 'nowrap',
          display: 'flex',
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
