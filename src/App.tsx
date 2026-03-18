import { useState, useEffect, useRef } from 'react';
import { Search, MessageSquare, BookOpen, ChevronRight, Send, Loader as Loader2, Menu, X, Sparkles, ChartBar as BarChart3, PenTool, Globe, TrendingUp, Target, Users, Briefcase, Activity, Clock, Settings } from 'lucide-react';
import Markdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { fetchSkills, fetchSkillContent } from './services/github';
import { Skill, SkillContent, Message, AIProvider } from './types';
import {
  createChatSession,
  saveChatMessage,
  trackSkillView,
  trackChatCreated,
  ChatSession,
  getUserPreferences,
  updateUserPreferences
} from './services/supabase';
import { chatWithAI } from './services/ai-chat';
import { translateSkill } from './services/translate';

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

const CATEGORY_LABELS: Record<string, string> = {
  'Conversion Optimization': 'Оптимизация на конверсии',
  'Content & Copy': 'Съдържание и копирайтинг',
  'SEO & Discovery': 'SEO и откриваемост',
  'Paid & Distribution': 'Платени кампании и дистрибуция',
  'Measurement & Testing': 'Измерване и тестване',
  'Retention': 'Ретеншън',
  'Strategy & Monetization': 'Стратегия и монетизация',
  'Sales & RevOps': 'Продажби и RevOps',
  'General': 'Общи умения'
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
  const [view, setView] = useState<'dashboard' | 'guide' | 'chat'>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
  const [sessionStartedAt] = useState<Date>(new Date());
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [lastUserQuestion, setLastUserQuestion] = useState<string | null>(null);
  const [provider, setProvider] = useState<AIProvider>('gemini');
  const [showSettings, setShowSettings] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const translatedSkillCacheRef = useRef<Map<string, string>>(new Map());
  const translateRequestIdRef = useRef(0);

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
    async function initPreferences() {
      try {
        const prefs = await getUserPreferences();
        const storedProvider = window.localStorage.getItem('ai-provider') as AIProvider | null;

        let initialProvider: AIProvider = 'gemini';
        const prefProvider = (prefs?.ai_provider || '') as AIProvider;
        if (prefProvider && ['gemini', 'openai', 'claude'].includes(prefProvider)) {
          initialProvider = prefProvider;
        } else if (storedProvider && ['gemini', 'openai', 'claude'].includes(storedProvider)) {
          initialProvider = storedProvider;
        }

        setProvider(initialProvider);

        if (!prefs?.ai_provider || prefs.ai_provider !== initialProvider) {
          await updateUserPreferences({ ai_provider: initialProvider });
        }
      } catch (error) {
        console.error('Error loading AI preferences:', error);
        const fallbackProvider =
          (window.localStorage.getItem('ai-provider') as AIProvider | null) || 'gemini';
        setProvider(fallbackProvider);
      }
    }

    initPreferences();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSelectSkill(skill: Skill) {
    setSelectedSkill(skill);
    setLoadingContent(true);
    setMessages([]);
    setView('guide');
    setCurrentSession(null);
    try {
      const content = await fetchSkillContent(skill.path);
      setSkillContent(content);
      // Показваме English веднага; преводът (BG) се зарежда асинхронно и сменя съдържанието,
      // когато/ако кешът в Supabase върне резултат.

      void trackSkillView(skill.name, skill.path).catch(console.error);

      const currentTranslateId = ++translateRequestIdRef.current;
      const cacheKey = `${provider}:${skill.path}`;

      // Memory cache е вторичен; основният кеш е в Supabase.
      const cached = translatedSkillCacheRef.current.get(cacheKey);
      if (cached) {
        // Уверяваме се, че потребителят още е на същия skill/provider.
        if (translateRequestIdRef.current === currentTranslateId) {
          setSkillContent({ name: content.name, markdown: cached });
        }
      } else {
        (async () => {
          try {
            const translated = await translateSkill(provider, skill.path, content.markdown);
            const translatedMarkdown = translated || content.markdown;
            translatedSkillCacheRef.current.set(cacheKey, translatedMarkdown);

            if (translateRequestIdRef.current !== currentTranslateId) return;
            setSkillContent({ name: content.name, markdown: translatedMarkdown });
          } catch (translationError) {
            console.error('Error translating skill content:', translationError);
          }
        })();
      }
    } catch (error) {
      console.error('Error fetching skill content:', error);
    } finally {
      setLoadingContent(false);
    }
  }

  async function handleSendMessage() {
    if (!input.trim() || !skillContent || isSending || !selectedSkill) return;

    let session = currentSession;
    if (!session) {
      session = await createChatSession(
        selectedSkill.name,
        selectedSkill.path,
        selectedSkill.category
      );
      if (session) {
        setCurrentSession(session);
        await trackChatCreated(selectedSkill.path);
      }
    }

    const userMessage: Message = { role: 'user', content: input };
    const updatedHistory = [...messages, userMessage];
    setMessages(updatedHistory);
    setTotalQuestions((prev) => prev + 1);
    setLastUserQuestion(input);
    setInput('');
    setIsSending(true);
    setView('chat');

    if (session) {
      await saveChatMessage(session.id, 'user', input);
    }

    try {
      const response = await chatWithAI(
        provider,
        skillContent.markdown,
        updatedHistory,
        input
      );
      const modelMessage: Message = { role: 'model', content: response };
      setMessages(prev => [...prev, modelMessage]);

      if (session) {
        await saveChatMessage(session.id, 'model', response);
      }
    } catch (error) {
      console.error('Error in chat:', error);
      const errorMessage = 'Извинявай, възникна грешка. Опитай отново.';
      setMessages(prev => [...prev, { role: 'model', content: errorMessage }]);

      if (session) {
        await saveChatMessage(session.id, 'model', errorMessage);
      }
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
        <p className="font-display italic text-xl">Зареждане на експертни умения...</p>
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
            <h1 className="font-display italic text-2xl">Маркетинг агент</h1>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-50" />
            <input 
              type="text" 
              placeholder="Търси умения..."
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
                <span className="text-[10px] uppercase tracking-widest font-semibold">
                  {CATEGORY_LABELS[category] || category}
                </span>
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
              <h2 className="font-display italic text-xl">
                {view === 'dashboard' ? 'Табло на маркетинг агента' : selectedSkill?.name}
              </h2>
              <p className="text-[10px] uppercase tracking-widest opacity-50">
                {view === 'dashboard'
                  ? 'Преглед на сесията и бързи действия'
                  : (selectedSkill?.category
                      ? CATEGORY_LABELS[selectedSkill.category] || selectedSkill.category
                      : '')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center text-[11px] opacity-60 border border-ink/10 rounded-lg px-2 py-1 bg-bg/80">
              <span className="mr-1 uppercase tracking-widest">AI</span>
              <select
                className="bg-transparent text-xs outline-none cursor-pointer"
                value={provider}
                onChange={(e) => {
                  const next = e.target.value as AIProvider;
                  setProvider(next);
                  window.localStorage.setItem('ai-provider', next);
                  updateUserPreferences({ ai_provider: next }).catch(console.error);
                }}
              >
                <option value="gemini">Gemini (Google)</option>
                <option value="openai">OpenAI</option>
                <option value="claude">Claude (Anthropic)</option>
              </select>
            </div>
            <button
              onClick={() => setShowSettings((v) => !v)}
              className="p-2 rounded-lg hover:bg-ink/5 flex items-center gap-2 text-xs"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">API Key</span>
            </button>

            <div className="flex bg-ink/5 p-1 rounded-lg">
              <button
                onClick={() => setView('dashboard')}
                className={cn(
                  "px-4 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-2",
                  view === 'dashboard' ? "bg-bg shadow-sm text-ink" : "text-ink/60 hover:text-ink"
                )}
              >
                <Activity className="w-3.5 h-3.5" />
                Табло
              </button>
              <button 
                onClick={() => setView('guide')}
                className={cn(
                  "px-4 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-2",
                  view === 'guide' ? "bg-bg shadow-sm text-ink" : "text-ink/60 hover:text-ink"
                )}
              >
                <BookOpen className="w-3.5 h-3.5" />
                Експертно ръководство
              </button>
              <button 
                onClick={() => setView('chat')}
                className={cn(
                  "px-4 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-2",
                  view === 'chat' ? "bg-bg shadow-sm text-ink" : "text-ink/60 hover:text-ink"
                )}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                AI асистент
              </button>
            </div>
          </div>
        </header>

        {/* Settings Panel */}
        {showSettings && (
          <div className="border-b border-ink/10 bg-bg/80 backdrop-blur-sm px-6 py-3 flex flex-col gap-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="uppercase tracking-widest opacity-60">AI настройки</span>
              <button
                onClick={() => setShowSettings(false)}
                className="text-[11px] opacity-60 hover:opacity-100"
              >
                Затвори
              </button>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <div className="flex flex-col gap-1 flex-1">
                <label className="opacity-60">
                  Доставчик
                </label>
                <select
                  className="bg-white border border-ink/10 rounded-md px-2 py-1 text-xs"
                  value={provider}
                  onChange={(e) => {
                    const next = e.target.value as AIProvider;
                    setProvider(next);
                    window.localStorage.setItem('ai-provider', next);
                    updateUserPreferences({ ai_provider: next }).catch(console.error);
                  }}
                >
                  <option value="gemini">Gemini (Google)</option>
                  <option value="openai">OpenAI</option>
                  <option value="claude">Claude (Anthropic)</option>
                </select>
              </div>
              <div className="flex flex-col gap-1 flex-[2] w-full text-[11px] opacity-70">
                <p>API ключовете се съхраняват централно в Supabase и не се виждат във фронтенда.</p>
                <p>За промяна на ключове или модели се свържи с администратор.</p>
              </div>
            </div>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto">
          {loadingContent ? (
            <div className="h-full flex flex-col items-center justify-center gap-4 opacity-50">
              <Loader2 className="w-6 h-6 animate-spin" />
              <p className="text-sm italic">Зареждане на ръководството за умението...</p>
            </div>
          ) : view === 'dashboard' ? (
            <div className="max-w-5xl mx-auto p-10 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white border border-ink/10 rounded-2xl p-4 flex flex-col gap-2 shadow-sm">
                  <div className="flex items-center justify-between text-xs uppercase tracking-widest opacity-60">
                    <span>Активно умение</span>
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <p className="font-display italic text-lg">
                    {selectedSkill?.name || 'Избери умение отляво'}
                  </p>
                  <p className="text-[11px] opacity-60">
                    {selectedSkill?.category || 'Без категория'}
                  </p>
                </div>

                <div className="bg-white border border-ink/10 rounded-2xl p-4 flex flex-col gap-2 shadow-sm">
                  <div className="flex items-center justify-between text-xs uppercase tracking-widest opacity-60">
                    <span>Статистика за сесията</span>
                    <BarChart3 className="w-4 h-4" />
                  </div>
                  <p className="text-2xl font-semibold">{totalQuestions}</p>
                  <p className="text-[11px] opacity-60">Въпроси в тази сесия</p>
                  <div className="flex items-center gap-1 text-[11px] opacity-60 mt-1">
                    <Clock className="w-3 h-3" />
                    <span>
                      Начало{' '}
                      {sessionStartedAt.toLocaleTimeString(undefined, {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                </div>

                <div className="bg-white border border-ink/10 rounded-2xl p-4 flex flex-col gap-2 shadow-sm">
                  <div className="flex items-center justify-between text-xs uppercase tracking-widest opacity-60">
                    <span>Последен въпрос</span>
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <p className="text-sm line-clamp-3">
                    {lastUserQuestion || 'Последният ти въпрос ще се появи тук.'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white border border-ink/10 rounded-2xl p-6 shadow-sm space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs uppercase tracking-widest opacity-60">
                      Бързи плейбукове
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <button
                      disabled={!selectedSkill}
                      onClick={() => {
                        if (!selectedSkill) return;
                        setInput(`Audit my current ${selectedSkill.name.toLowerCase()} setup and give me a 3-step action plan.`);
                        setView('chat');
                      }}
                      className={cn(
                        "text-left px-4 py-3 rounded-xl border border-ink/10 hover:border-ink/30 transition-colors",
                        !selectedSkill && "opacity-40 cursor-not-allowed"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Target className="w-4 h-4" />
                        <span className="font-medium">3-стъпков план за подобрение</span>
                      </div>
                      <p className="text-[12px] opacity-70">
                        Получи приоритизиран, кратък план според избраното умение.
                      </p>
                    </button>

                    <button
                      disabled={!selectedSkill}
                      onClick={() => {
                        if (!selectedSkill) return;
                        setInput(`Suggest 5 high-impact experiments for ${selectedSkill.name.toLowerCase()}, with hypothesis and success metrics.`);
                        setView('chat');
                      }}
                      className={cn(
                        "text-left px-4 py-3 rounded-xl border border-ink/10 hover:border-ink/30 transition-colors",
                        !selectedSkill && "opacity-40 cursor-not-allowed"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <TrendingUp className="w-4 h-4" />
                        <span className="font-medium">Идеи за експерименти</span>
                      </div>
                      <p className="text-[12px] opacity-70">
                        Генерирай тестови идеи с ясни хипотези и KPI.
                      </p>
                    </button>

                    <button
                      disabled={!selectedSkill}
                      onClick={() => {
                        if (!selectedSkill) return;
                        setInput(`Give me a checklist to review my ${selectedSkill.name.toLowerCase()} in under 10 minutes.`);
                        setView('chat');
                      }}
                      className={cn(
                        "text-left px-4 py-3 rounded-xl border border-ink/10 hover:border-ink/30 transition-colors",
                        !selectedSkill && "opacity-40 cursor-not-allowed"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <PenTool className="w-4 h-4" />
                        <span className="font-medium">10-минутен чеклист</span>
                      </div>
                      <p className="text-[12px] opacity-70">
                        Стегнат чеклист, съобразен с това умение.
                      </p>
                    </button>

                    <button
                      disabled={!selectedSkill}
                      onClick={() => {
                        if (!selectedSkill) return;
                        setInput(`Act as my senior marketing lead for ${selectedSkill.name.toLowerCase()} and ask me 5 diagnostic questions before giving advice.`);
                        setView('chat');
                      }}
                      className={cn(
                        "text-left px-4 py-3 rounded-xl border border-ink/10 hover:border-ink/30 transition-colors",
                        !selectedSkill && "opacity-40 cursor-not-allowed"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Users className="w-4 h-4" />
                        <span className="font-medium">Насочено откриване</span>
                      </div>
                      <p className="text-[12px] opacity-70">
                        Нека агентът първо те „интервюира“, преди да препоръча работа.
                      </p>
                    </button>
                  </div>
                </div>

                <div className="bg-white border border-ink/10 rounded-2xl p-6 shadow-sm space-y-3">
                  <h3 className="text-xs uppercase tracking-widest opacity-60">
                    Как да получиш най-добри отговори
                  </h3>
                  <ul className="text-[12px] space-y-2 opacity-80 list-disc list-inside">
                    <li>Опиши продукта, аудиторията и основната цел в 1–2 изречения.</li>
                    <li>Поставяй URL-и, когато е възможно, за да може агентът да анализира страницата.</li>
                    <li>Искай конкретни формати: „3 заглавия“, „структура на имейл“, „план за A/B тест“.</li>
                    <li>Итерарай: уточнявай според това какво ти харесва и какво не.</li>
                  </ul>
                </div>
              </div>
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
                      <h3 className="font-display italic text-2xl">Започни консултация</h3>
                      <p className="text-sm max-w-xs mx-auto">
                        Попитай ме за всичко, свързано с {selectedSkill?.name.toLowerCase()}. Ще използвам експертните насоки, за да ти помогна.
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
                    <span>Анализ на уебсайт е активиран</span>
                  </div>
                </div>
                <div className="relative flex items-center gap-2">
                  <input
                    type="text"
                    placeholder={`Постави URL или попитай за ${selectedSkill?.name.toLowerCase()}...`}
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
                  Задвижвано от Gemini 3.1 Pro и експертни маркетинг умения
                </p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

