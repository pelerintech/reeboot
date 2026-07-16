import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';

interface MessageProps {
  role: 'user' | 'assistant' | 'error';
  content: string;
  streaming?: boolean;
}

export default function Message({ role, content, streaming }: MessageProps) {
  const isUser = role === 'user';
  const isError = role === 'error';

  if (isError) {
    return (
      <div className="flex justify-center my-4">
        <div role="error-msg" className="bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-2 text-sm">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
      <div
        className={`text-[15px] leading-relaxed ${
          isUser
            ? 'bg-zinc-900 text-white rounded-2xl rounded-tr-sm px-4 py-2.5'
            : 'text-zinc-800'
        }`}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap break-words">{content}</div>
        ) : (
          <div className="prose prose-sm prose-zinc max-w-none prose-headings:font-semibold prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline prose-code:before:content-none prose-code:after:content-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={{
                pre: ({ children }) => (
                  <pre className="bg-zinc-900 rounded-lg p-4 my-3 overflow-x-auto text-sm border border-zinc-700 text-zinc-100 [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-zinc-100">
                    {children}
                  </pre>
                ),
                code: ({ className, children, ...props }) => {
                  return (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  );
                },
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    {children}
                  </a>
                ),
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        )}
        {streaming && !isUser && <span className="inline-block text-zinc-400 ml-1">▋</span>}
      </div>
    </div>
  );
}
