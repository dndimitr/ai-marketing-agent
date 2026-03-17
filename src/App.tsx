import { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  MessageSquare, 
  BookOpen, 
  ChevronRight, 
  Send, 
  Loader2, 
  Menu, 
  X,
  Sparkles,
  BarChart3,
  PenTool,
  Globe,
  TrendingUp,
  Target,
  Users,
  Briefcase
} from 'lucide-react';
import Markdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { fetchSkills, fetchSkillContent } from './services/github';
import { chatWithSkill } from './services/gemini';
import { Skill, SkillContent, Message } from './types';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const CATEGORY_ICONS: Record<string, any> = {
  'Conversion Optimization': Target,
  'Content & Copy': PenTool,
  'SEO & Discovery': Globe,
  'Paid & Distribution': TrendingUp,
  'Measurement & Testing': BarChart3,
  'Retention': Users,
  'Strategy & Monetization': Sparkles,
  'Sales & RevOps': Briefcase,
  'General': BookOpen
};

export default function App() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [skillContent, setSkillContent] = useState<SkillContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingContent, setLoadingContent] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [view, setView] = useState<'guide' | 'chat'>('guide');
  const [searchQuery, setSearchQuery] = useState('');

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function init() {
      try {
        const fetchedSkills = await fetchSkills();
        setSkills(fetchedSkills);
        if (fetchedSkills.length > 0) {
          handleSelectSkill(fetchedSkills[0]);
        }
      } catch (error) {
        console.error('Error fetching skills:', error);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSelectSkill(skill: Skill) {
    setSelectedSkill(skill);
    setLoadingContent(true);
    setMessages([]);
    setView('guide');
    try {
      const content = await fetchSkillContent(skill.path);
      setSkillContent(content);
    } catch (error) {
      console.error('Error fetching skill content:', error);
    } finally {
      setLoadingContent(false);
    }
  }

  async function handleSendMessage() {
    if (!input.trim() || !skillContent || isSending) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsSending(true);
    setView('chat');

    try {
      const response = await chatWithSkill(skillContent.markdown, messages, input);
      const modelMessage: Message = { role: 'model', content: response };
      setMessages(prev => [...prev, modelMessage]);
    } catch (error) {
      console.error('Error in chat:', error);
      setMessages(prev => [...prev, { role: 'model', content: 'Sorry, I encountered an error. Please try again.' }]);
    } finally {
      setIsSending(false);
    }
  }

  const filteredSkills = skills.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.category?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const categories = Array.from(new Set(filteredSkills.map(s => s.category || 'General'))).sort();

  if (loading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-8 h-8 animate-spin" />
        <p className="font-display italic text-xl">Loading expert skills...</p>
      </div>
    );
  }

  return (
    <div className="h-screen flex overflow-hidden">
      {/* Sidebar */}
      <aside className={cn(
        "bg-ink text-bg w-80 flex-shrink-0 flex flex-col transition-all duration-300 z-30",
        !sidebarOpen && "-ml-80"
      )}>
        <div className="p-6 border-b border-bg/10">
          <div className="flex items-center justify-between mb-6">
            <h1 className="font-display italic text-2xl">Marketing Agent</h1>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-50" />
            <input 
              type="text" 
              placeholder="Search skills..."
              className="w-full bg-bg/5 border border-bg/10 rounded-lg py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-bg/30"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {categories.map(category => (
            <div key={category} className="space-y-2">
              <div className="flex items-center gap-2 px-2 opacity-50">
                {(() => {
                  const Icon = CATEGORY_ICONS[category] || BookOpen;
                  return <Icon className="w-3 h-3" />;
                })()}
                <span className="text-[10px] uppercase tracking-widest font-semibold">{category}</span>
              </div>
              <div className="space-y-1">
                {filteredSkills.filter(s => (s.category || 'General') === category).map(skill => (
                  <button
                    key={skill.path}
                    onClick={() => handleSelectSkill(skill)}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between group",
                      selectedSkill?.path === skill.path 
                        ? "bg-bg text-ink" 
                        : "hover:bg-bg/5"
                    )}
                  >
                    <span>{skill.name}</span>
                    <ChevronRight className={cn(
                      "w-4 h-4 transition-transform",
                      selectedSkill?.path === skill.path ? "translate-x-0" : "-translate-x-2 opacity-0 group-hover:opacity-100 group-hover:translate-x-0"
                    )} />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative bg-bg min-w-0">
        {/* Header */}
        <header className="h-16 border-b border-ink/10 flex items-center justify-between px-6 bg-bg/80 backdrop-blur-sm sticky top-0 z-20">
          <div className="flex items-center gap-4">
            {!sidebarOpen && (
              <button onClick={() => setSidebarOpen(true)} className="p-2 hover:bg-ink/5 rounded-lg">
                <Menu className="w-5 h-5" />
              </button>
            )}
            <div>
              <h2 className="font-display italic text-xl">{selectedSkill?.name}</h2>
              <p className="text-[10px] uppercase tracking-widest opacity-50">{selectedSkill?.category}</p>
            </div>
          </div>

          <div className="flex bg-ink/5 p-1 rounded-lg">
            <button 
              onClick={() => setView('guide')}
              className={cn(
                "px-4 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-2",
                view === 'guide' ? "bg-bg shadow-sm text-ink" : "text-ink/60 hover:text-ink"
              )}
            >
              <BookOpen className="w-3.5 h-3.5" />
              Expert Guide
            </button>
            <button 
              onClick={() => setView('chat')}
              className={cn(
                "px-4 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-2",
                view === 'chat' ? "bg-bg shadow-sm text-ink" : "text-ink/60 hover:text-ink"
              )}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              AI Assistant
            </button>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto">
          {loadingContent ? (
            <div className="h-full flex flex-col items-center justify-center gap-4 opacity-50">
              <Loader2 className="w-6 h-6 animate-spin" />
              <p className="text-sm italic">Loading skill guidelines...</p>
            </div>
          ) : view === 'guide' ? (
            <div className="max-w-3xl mx-auto p-12">
              <div className="markdown-body">
                <Markdown>{skillContent?.markdown}</Markdown>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col max-w-4xl mx-auto w-full">
              <div className="flex-1 p-6 space-y-6 overflow-y-auto">
                {messages.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50">
                    <div className="w-16 h-16 rounded-full bg-ink/5 flex items-center justify-center">
                      <MessageSquare className="w-8 h-8" />
                    </div>
                    <div>
                      <h3 className="font-display italic text-2xl">Start a consultation</h3>
                      <p className="text-sm max-w-xs mx-auto">
                        Ask me anything about {selectedSkill?.name.toLowerCase()}. I'll use the expert guidelines to help you.
                      </p>
                    </div>
                  </div>
                )}
                {messages.map((msg, i) => (
                  <div key={i} className={cn(
                    "flex flex-col gap-2",
                    msg.role === 'user' ? "items-end" : "items-start"
                  )}>
                    <div className={cn(
                      "max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed",
                      msg.role === 'user' 
                        ? "bg-ink text-bg rounded-tr-none" 
                        : "bg-white border border-ink/10 rounded-tl-none shadow-sm"
                    )}>
                      <div className="markdown-body">
                        <Markdown>{msg.content}</Markdown>
                      </div>
                    </div>
                  </div>
                ))}
                {isSending && (
                  <div className="flex items-start gap-2">
                    <div className="bg-white border border-ink/10 p-4 rounded-2xl rounded-tl-none shadow-sm">
                      <Loader2 className="w-4 h-4 animate-spin opacity-50" />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input Area */}
              <div className="p-6 border-t border-ink/10 bg-bg/50 backdrop-blur-md">
                <div className="flex items-center gap-2 mb-2 px-1">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-semibold opacity-40">
                    <Globe className="w-3 h-3" />
                    <span>Website analysis enabled</span>
                  </div>
                </div>
                <div className="relative flex items-center gap-2">
                  <input
                    type="text"
                    placeholder={`Paste a URL or ask about ${selectedSkill?.name.toLowerCase()}...`}
                    className="flex-1 bg-white border border-ink/10 rounded-xl py-3 pl-4 pr-12 text-sm focus:outline-none focus:border-ink/30 shadow-sm"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!input.trim() || isSending}
                    className="absolute right-2 p-2 bg-ink text-bg rounded-lg disabled:opacity-50 transition-all hover:scale-105 active:scale-95"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-[10px] text-center mt-3 opacity-30 uppercase tracking-widest">
                  Powered by Gemini 3.1 Pro & Expert Marketing Skills
                </p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

