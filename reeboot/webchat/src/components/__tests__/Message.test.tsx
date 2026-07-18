import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Message from '../Message';

describe('Message', () => {
  it('renders user message with correct styling', () => {
    render(<Message role="user" content="Hello!" />);
    expect(screen.getByText('Hello!')).toBeInTheDocument();
  });

  it('renders assistant message with correct styling', () => {
    render(<Message role="assistant" content="Hi there!" />);
    expect(screen.getByText('Hi there!')).toBeInTheDocument();
  });

  it('renders error message with correct styling', () => {
    render(<Message role="error" content="Something went wrong" />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('shows streaming indicator when streaming is true for assistant', () => {
    render(<Message role="assistant" content="Streaming…" streaming />);
    expect(screen.getByText('▋')).toBeInTheDocument();
  });

  it('does not show streaming indicator when streaming is false', () => {
    render(<Message role="assistant" content="Done" streaming={false} />);
    expect(screen.queryByText('▋')).not.toBeInTheDocument();
  });

  it('does not show streaming indicator for user messages', () => {
    render(<Message role="user" content="Hello" streaming />);
    expect(screen.queryByText('▋')).not.toBeInTheDocument();
  });

  it('renders markdown bold text', () => {
    const { container } = render(<Message role="assistant" content="This is **bold** text" />);
    const strong = container.querySelector('strong');
    expect(strong).toBeInTheDocument();
    expect(strong?.textContent).toBe('bold');
  });

  it('renders markdown italic text', () => {
    const { container } = render(<Message role="assistant" content="This is *italic* text" />);
    const em = container.querySelector('em');
    expect(em).toBeInTheDocument();
    expect(em?.textContent).toBe('italic');
  });

  it('renders inline code', () => {
    render(<Message role="assistant" content="Use `npm install` to install" />);
    const code = screen.getByText('npm install');
    expect(code).toBeInTheDocument();
    expect(code.tagName).toBe('CODE');
  });

  it('renders code blocks', () => {
    const codeBlockContent = 'const x = 1';
    const content = `Code:\n\`\`\`js\n${codeBlockContent}\n\`\`\``;
    const { container } = render(
      <Message role="assistant" content={content} />
    );
    const pre = container.querySelector('pre');
    expect(pre).not.toBeNull();
    expect(pre?.textContent).toContain(codeBlockContent);
  });

  it('renders links', () => {
    render(<Message role="assistant" content="Visit [example](https://example.com)" />);
    const link = screen.getByText('example');
    expect(link).toBeInTheDocument();
    expect(link.closest('a')?.getAttribute('href')).toBe('https://example.com');
  });

  it('renders empty content', () => {
    render(<Message role="assistant" content="" />);
    expect(screen.queryByText('Hello')).not.toBeInTheDocument();
  });
});
