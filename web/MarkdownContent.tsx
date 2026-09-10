import 'katex/dist/katex.min.css';
import MarkdownRenderer from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

export default function MarkdownContent({ text }: { text: string }) {
  return (
    <div className="markdown">
      <MarkdownRenderer
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { strict: false, trust: false }]]}
        components={{
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          img: ({ alt }) => (
            <span className="remote-image">
              Image reference: {alt || 'external image'} (external images are not loaded
              automatically)
            </span>
          ),
        }}
      >
        {text}
      </MarkdownRenderer>
    </div>
  );
}
