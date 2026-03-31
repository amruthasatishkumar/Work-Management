import { useState, useRef, useEffect, Fragment } from 'react';
import { Send, Loader2, Bot, Trash2 } from 'lucide-react';
import { PageHeader, Button } from '../components/ui';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// Renders markdown-like text: bold, bullet lists, line breaks — no library needed
function MarkdownText({ text }: { text: string }) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];

  function flushList() {
    if (listItems.length) {
      elements.push(
        <ul key={`ul-${elements.length}`} className="list-disc list-inside space-y-0.5 my-1">
          {listItems.map((item, i) => <li key={i}>{renderInline(item)}</li>)}
        </ul>
      );
      listItems = [];
    }
  }

  function renderInline(line: string): React.ReactNode[] {
    // Handle **bold**
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      return <Fragment key={i}>{part}</Fragment>;
    });
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const bulletMatch = line.match(/^[\-\*]\s+(.+)/);
    if (bulletMatch) {
      listItems.push(bulletMatch[1]);
    } else {
      flushList();
      if (line.trim() === '') {
        if (i > 0 && lines[i - 1].trim() !== '') {
          elements.push(<br key={`br-${i}`} />);
        }
      } else {
        elements.push(<p key={`p-${i}`} className="my-0.5">{renderInline(line)}</p>);
      }
    }
  }
  flushList();
  return <div>{elements}</div>;
}

const STARTERS = [
  'Give me a dashboard summary',
  'Which accounts have no recent activity?',
  'Show me all Committed opportunities',
  'Show me all uncommitted opportunities?',
  'What tasks do I have In Progress?',
  'What SE Work items are In Progress?',
];

const WELCOME: Message = {
  role: 'assistant',
  content: "Hi! I'm your Work Assistant. Ask me anything about your accounts, opportunities, activities, tasks, or SE Work.",
};

const SESSION_KEY = 'work_chat_messages';

function loadMessages(): Message[] {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) return JSON.parse(stored) as Message[];
  } catch { /* ignore */ }
  return [WELCOME];
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>(loadMessages);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(messages)); } catch { /* ignore */ }
  }, [messages]);

  async function send(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;

    const userMsg: Message = { role: 'user', content: msg };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next.map(m => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error ?? res.statusText);
      }

      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply ?? 'No response.' }]);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : 'Unknown error';
      setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ ${errMsg}` }]);
    } finally {
      setLoading(false);
    }
  }

  function clearChat() {
    setMessages([WELCOME]);
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Assistant"
        subtitle="Ask questions about your accounts, opportunities, activities, tasks, and SE Work"
        action={
          <Button variant="secondary" onClick={clearChat}>
            <Trash2 size={14} /> Clear chat
          </Button>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Chat area */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mr-2 mt-0.5">
                    <Bot size={14} className="text-blue-600" />
                  </div>
                )}
                <div
                  className={`max-w-[70%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-sm whitespace-pre-wrap'
                      : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-bl-sm shadow-sm'
                  }`}
                >
                  {m.role === 'user' ? m.content : <MarkdownText text={m.content} />}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mr-2">
                  <Bot size={14} className="text-blue-600" />
                </div>
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                  <Loader2 size={14} className="animate-spin text-slate-400" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <div className="flex gap-3">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Ask about your work..."
                disabled={loading}
                className="flex-1 text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2.5 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 dark:disabled:bg-slate-800"
              />
              <button
                onClick={() => send()}
                disabled={!input.trim() || loading}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-xl px-4 py-2.5 transition-colors cursor-pointer shrink-0"
              >
                <Send size={16} />
              </button>
            </div>
            <p className="text-center text-xs text-slate-400 dark:text-slate-500 py-1.5">
              Chat history is kept until you close this browser tab.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
