import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { RAGQueryService } from '@/services/ragQueryService';
import { ChatHistoryService, ChatMessage } from '@/services/chatHistoryService';
import { supabase } from '@/lib/supabase';
// import DocumentTreeSelector from '@/components/DocumentTreeSelector';
import SourceCitation from '@/components/SourceCitation';
import { YouTubePlayer } from '@/components/YouTubePlayer';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import {
  Send,
  BookOpen,
  Save,
  Download,
  Copy,
  Check,
  Loader2,
  Trash2,
  Pin,
  History,
  LogOut,
  Code,
  FileText,
  AlignLeft,
  Mic,
  MicOff
} from 'lucide-react';
import { toast } from 'sonner';

export default function EnhancedChatPage() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [selectedMasters, setSelectedMasters] = useState<string[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [chatTitle, setChatTitle] = useState('');
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [savedChats, setSavedChats] = useState<any[]>([]);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [showDebugModal, setShowDebugModal] = useState(false);
  const [debugData, setDebugData] = useState<{ systemPrompt: string; userPrompt: string } | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const ragService = new RAGQueryService();
  const chatHistoryService = new ChatHistoryService();

  useEffect(() => {
    // Clean up old shared localStorage key (PRIVACY FIX - migration)
    const oldSharedChat = localStorage.getItem('hfnai_chat_current');
    if (oldSharedChat) {
      console.log('🧹 Removing old shared chat data for privacy compliance');
      localStorage.removeItem('hfnai_chat_current');
    }

    loadUser();
    initializeSpeechRecognition();
  }, []);

  const initializeSpeechRecognition = () => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognitionInstance = new SpeechRecognition();
      
      recognitionInstance.continuous = false;
      recognitionInstance.interimResults = false;
      recognitionInstance.lang = 'en-US';

      recognitionInstance.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInputValue(transcript);
        setIsListening(false);
      };

      recognitionInstance.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        toast.error('Could not recognize speech. Please try again.');
        setIsListening(false);
      };

      recognitionInstance.onend = () => {
        setIsListening(false);
      };

      setRecognition(recognitionInstance);
    }
  };

  const toggleVoiceInput = () => {
    if (!recognition) {
      toast.error('Speech recognition not supported in your browser');
      return;
    }

    if (isListening) {
      recognition.stop();
      setIsListening(false);
    } else {
      try {
        recognition.start();
        setIsListening(true);
        toast.info('Listening... Speak now');
      } catch (error) {
        console.error('Error starting recognition:', error);
        toast.error('Failed to start voice input');
      }
    }
  };



  // Auto-save to local storage (USER-SPECIFIC)
  useEffect(() => {
    if (messages.length > 0 && currentUser) {
      chatHistoryService.saveToLocalStorage(`current_${currentUser.id}`, messages);
    }
  }, [messages, currentUser]);

  // Clear chat when user changes (PRIVACY FIX)
  useEffect(() => {
    if (currentUser) {
      // Load this user's chat
      loadLocalChat(currentUser.id);
    } else {
      // No user = clear everything
      setMessages([]);
      setSelectedDocumentIds([]);
      setSelectedMasters([]);
    }
  }, [currentUser?.id]);

  const loadUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUser(user);
    if (user) {
      loadSavedChats(user.id);
    }
  };

  const loadLocalChat = (userId: string) => {
    // User-specific localStorage key
    const localMessages = chatHistoryService.loadFromLocalStorage(`current_${userId}`);
    if (localMessages && localMessages.length > 0) {
      setMessages(localMessages);
    } else {
      setMessages([]); // Start fresh if no saved chat
    }
  };

  const loadSavedChats = async (userId: string) => {
    const result = await chatHistoryService.loadChats(userId, { limit: 10 });
    if (result.success && result.chats) {
      setSavedChats(result.chats);
    }
  };

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    // Check if documents are selected (if not, show toast)
    // if (selectedDocumentIds.length === 0) {
    //   toast.error('Please select at least one document first');
    //   return;
    // }

    const questionText = text.trim();
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: questionText,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setInputValue('');

    // Scroll to bottom for user message
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);

    try {
      console.log('🔍 Asking question:', questionText);
      console.log('📚 Selected documents:', selectedDocumentIds.length);
      console.log('👨‍🏫 Selected masters:', selectedMasters);

      const response = await ragService.askQuestion(questionText, {
        preceptorId: currentUser?.id,
        // selectedDocumentIds: selectedDocumentIds.length > 0 ? selectedDocumentIds : undefined,
        // selectedMasters: selectedMasters.length > 0 ? selectedMasters : undefined
      });

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: response.success ? response.answer || '' : response.message || 'No response',
        summary: response.summary,
        reading_time: response.reading_time,
        timestamp: new Date(),
        citations: response.citations,
        aiModel: response.metadata?.model,
        debug: response.debug
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Smart Scroll: Scroll to the QUESTION so user sees context + answer
      setTimeout(() => {
        const questionElement = document.getElementById(`message-${userMessage.id}`);
        if (questionElement) {
          questionElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          // Fallback to answer if question not found (rare)
          const answerElement = document.getElementById(`message-${assistantMessage.id}`);
          answerElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    } catch (error) {
      console.error('Chat error:', error);
      toast.error('Failed to get response. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      await handleSendMessage(inputValue);
    }
  };

  const handleSaveChat = async () => {
    if (!currentUser) {
      toast.error('Please log in to save chats');
      return;
    }

    if (messages.length === 0) {
      toast.error('No messages to save');
      return;
    }

    const title = chatTitle || `Chat ${new Date().toLocaleDateString()}`;
    const result = await chatHistoryService.saveChat(currentUser.id, messages, {
      chatTitle: title,
      selectedDocuments: selectedDocumentIds,
      selectedMasters
    });

    if (result.success) {
      toast.success('Chat saved successfully!');
      setShowSaveDialog(false);
      setChatTitle('');
      loadSavedChats(currentUser.id);
    } else {
      toast.error('Failed to save chat');
    }
  };

  const handleLoadChat = async (chatId: string) => {
    const result = await chatHistoryService.loadChat(chatId);
    if (result.success && result.chat) {
      setMessages(result.chat.messages);
      setSelectedDocumentIds(result.chat.selected_documents || []);
      setSelectedMasters(result.chat.selected_masters || []);
      setShowHistoryPanel(false);
      toast.success('Chat loaded');
    } else {
      toast.error('Failed to load chat');
    }
  };

  const handleExportToPDF = async () => {
    if (!chatContainerRef.current) return;

    try {
      toast.info('Generating PDF...');
      const canvas = await html2canvas(chatContainerRef.current, {
        scale: 2,
        logging: false,
        windowWidth: 800
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`heartfulness-chat-${Date.now()}.pdf`);
      toast.success('PDF downloaded!');
    } catch (error) {
      console.error('PDF export error:', error);
      toast.error('Failed to export PDF');
    }
  };

  const handleCopyMessage = async (message: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedMessageId(message.id);
      setTimeout(() => setCopiedMessageId(null), 2000);
      toast.success('Copied to clipboard');
    } catch (error) {
      toast.error('Failed to copy');
    }
  };

  const handleClearChat = () => {
    if (window.confirm('Clear all messages? This cannot be undone.')) {
      setMessages([]);
      if (currentUser) {
        chatHistoryService.clearLocalStorage(`current_${currentUser.id}`);
      }
      toast.success('Chat cleared');
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      toast.success('Logged out successfully');
      navigate('/auth');
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('Failed to logout');
    }
  };

  // const handleSelectionChange = (docIds: string[], masterNames: string[]) => {
  //   setSelectedDocumentIds(docIds);
  //   setSelectedMasters(masterNames);
  // };

  return (
    <div className="h-screen flex flex-col bg-dark-bg-primary overflow-hidden">
      {/* Header */}
      <header className="bg-dark-bg-secondary border-b border-dark-border-primary shadow-sm">
        <div className="max-w-full mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-xl font-bold text-dark-text-primary flex items-center gap-2">
                ⚖️ Legal Research Assistant
              </h1>
              <p className="text-xs text-dark-text-secondary">
                Searching legal documents and case law
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHistoryPanel(!showHistoryPanel)}
              className="p-2 hover:bg-dark-bg-elevated rounded-lg transition"
              title="Chat History"
            >
              <History className="h-5 w-5 text-dark-accent-orange" />
            </button>
            <button
              onClick={() => setShowSaveDialog(true)}
              className="p-2 hover:bg-dark-bg-elevated rounded-lg transition"
              disabled={messages.length === 0}
              title="Save Chat"
            >
              <Save className="h-5 w-5 text-dark-accent-orange" />
            </button>
            <button
              onClick={handleExportToPDF}
              className="p-2 hover:bg-dark-bg-elevated rounded-lg transition"
              disabled={messages.length === 0}
              title="Export to PDF"
            >
              <Download className="h-5 w-5 text-dark-accent-orange" />
            </button>
            <button
              onClick={handleClearChat}
              className="p-2 hover:bg-red-900/30 rounded-lg transition"
              disabled={messages.length === 0}
              title="Clear Chat"
            >
              <Trash2 className="h-5 w-5 text-red-400" />
            </button>
            <button
              onClick={handleLogout}
              className="p-2 hover:bg-dark-bg-elevated rounded-lg transition"
              title="Logout"
            >
              <LogOut className="h-5 w-5 text-dark-text-secondary" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-x-auto overflow-y-hidden" style={{ WebkitOverflowScrolling: 'touch' }}>
        {/* Sidebar - Document Tree Selector (REMOVED) */}
        {/* <div className="w-72 sm:w-80 flex-shrink-0 bg-white border-r border-purple-200 shadow-lg">
          <DocumentTreeSelector
            onSelectionChange={handleSelectionChange}
            className="h-full"
          />
        </div> */}

        {/* Main Chat Area */}
        <div className="flex-1 min-w-0 flex flex-col">

          {/* Messages */}
          <div
            ref={chatContainerRef}
            className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6"
          >
            {messages.length === 0 && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center max-w-2xl px-4">
                  <BookOpen className="h-16 w-16 mx-auto mb-4 text-dark-accent-orange/60" />
                  <h2 className="text-2xl font-semibold text-dark-text-primary mb-2">
                    Welcome to Legal Research Assistant
                  </h2>
                  <p className="text-dark-text-secondary mb-8">
                    Ask questions about Indian law, case law, statutes, and judicial precedents.
                  </p>

                  {/* Sample Prompts */}
                  <div className="grid grid-cols-2 gap-2 md:gap-4 text-left">
                    {[
                      "What is the basic structure doctrine?",
                      "Explain the right to privacy under Article 21",
                      "What is the test for judicial review?",
                      "Explain the doctrine of legitimate expectation"
                    ].map((question, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSendMessage(question)}
                        className="p-2 md:p-4 bg-dark-bg-elevated hover:bg-dark-bg-elevated/80 border border-dark-border-primary hover:border-dark-accent-orange/50 rounded-xl transition text-xs md:text-sm text-dark-text-primary font-medium text-center"
                      >
                        {question}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                id={`message-${message.id}`}
                className={`flex max-w-4xl mx-auto w-full ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`rounded-lg ${message.type === 'user'
                    ? 'max-w-[85%] md:max-w-[75%] question-bubble shadow-sm'
                    : 'w-full bg-transparent p-0'
                    }`}
                >
                  <div className={message.type === 'user' ? 'p-4' : 'py-2'}>
                    {message.type === 'user' ? (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        className="prose prose-sm max-w-none prose-invert"
                      >
                        {message.content}
                      </ReactMarkdown>
                    ) : (
                      <StructuredMessage
                        message={message}
                        onCopy={() => handleCopyMessage(message)}
                      />
                    )}
                  </div>

                  {/* Message Actions */}
                  <div className={`px-4 pb-2 flex items-center gap-2 ${message.type === 'user' ? 'border-t border-dark-border-primary' : 'mt-2 pt-2 border-t border-dark-border-primary'}`}>
                    <button
                      onClick={() => handleCopyMessage(message)}
                      className={`text-xs p-1.5 rounded transition flex items-center gap-1 ${message.type === 'user' ? 'text-dark-text-secondary hover:bg-dark-bg-secondary' : 'text-dark-text-secondary hover:bg-dark-bg-elevated'
                        }`}
                    >
                      {copiedMessageId === message.id ? (
                        <>
                          <Check className="h-3 w-3" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          Copy
                        </>
                      )}
                    </button>
                    {message.aiModel && (
                      <span className="text-xs text-dark-text-muted ml-auto">
                        {message.aiModel}
                      </span>
                    )}
                    {message.debug && (
                      <button
                        onClick={() => {
                          setDebugData(message.debug || null);
                          setShowDebugModal(true);
                        }}
                        className={`text-xs p-1.5 rounded transition flex items-center gap-1 ml-2 ${message.type === 'user' ? 'text-dark-text-secondary hover:bg-dark-bg-secondary' : 'text-dark-text-secondary hover:bg-dark-bg-elevated'
                          }`}
                        title="View System Prompt"
                      >
                        <Code className="h-3 w-3" />
                        Prompt
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex max-w-4xl mx-auto w-full justify-start">
                <div className="bg-dark-bg-elevated border border-dark-border-primary rounded-lg shadow-sm p-4 flex items-center gap-3">
                  <Loader2 className="h-4 w-4 animate-spin text-dark-accent-orange" />
                  <span className="text-dark-text-secondary">Searching sacred texts...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Footer */}
          <div className="border-t border-dark-border-primary bg-dark-bg-secondary p-2 md:p-4">
            <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Ask about meditation, spirituality, or..."
                  className="flex-1 px-3 py-2 md:px-4 md:py-3 rounded-lg bg-dark-bg-primary border border-dark-border-primary focus:outline-none focus:border-dark-accent-orange text-dark-text-primary placeholder-dark-text-muted text-sm md:text-base"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={toggleVoiceInput}
                  disabled={isLoading}
                  className={`px-3 py-2 md:px-4 md:py-3 rounded-lg font-medium transition text-sm md:text-base flex items-center gap-2 ${
                    isListening 
                      ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse' 
                      : 'bg-dark-bg-elevated hover:bg-dark-bg-tertiary text-dark-text-primary border border-dark-border-primary'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                  title={isListening ? 'Stop listening' : 'Voice input'}
                >
                  {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </button>
                <button
                  type="submit"
                  disabled={isLoading || !inputValue.trim()}
                  className="px-3 py-2 md:px-6 md:py-3 bg-dark-accent-orange text-white rounded-lg hover:bg-dark-accent-orangeHover disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium transition text-sm md:text-base whitespace-nowrap"
                >
                  <Send className="h-4 w-4" />
                  {isLoading ? 'Thinking...' : 'Ask'}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* History Panel */}
        {showHistoryPanel && (
          <div className="w-80 bg-dark-bg-secondary border-l border-dark-border-primary shadow-lg overflow-y-auto">
            <div className="p-4 border-b border-dark-border-primary">
              <h3 className="font-semibold text-dark-text-primary flex items-center gap-2">
                <History className="h-5 w-5" />
                Saved Chats
              </h3>
            </div>
            <div className="p-4 space-y-2">
              {savedChats.length === 0 ? (
                <p className="text-sm text-dark-text-secondary text-center py-8">No saved chats yet</p>
              ) : (
                savedChats.map(chat => (
                  <div
                    key={chat.id}
                    onClick={() => handleLoadChat(chat.id)}
                    className="p-3 border border-dark-border-primary rounded-lg hover:bg-dark-bg-elevated cursor-pointer transition"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-dark-text-primary truncate">
                          {chat.chat_title}
                        </p>
                        <p className="text-xs text-dark-text-muted">
                          {new Date(chat.saved_at).toLocaleDateString()}
                        </p>
                        <p className="text-xs text-dark-accent-orange mt-1">
                          {chat.messages.length} messages
                        </p>
                      </div>
                      {chat.is_pinned && <Pin className="h-4 w-4 text-dark-accent-orange" />}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Save Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-dark-bg-secondary rounded-lg shadow-xl max-w-md w-full mx-4 border border-dark-border-primary">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-dark-text-primary mb-4">Save Chat</h3>
              <div className="mb-4">
                <label className="block text-sm font-medium text-dark-text-secondary mb-2">
                  Chat Title (optional)
                </label>
                <input
                  type="text"
                  value={chatTitle}
                  onChange={(e) => setChatTitle(e.target.value)}
                  placeholder={`Chat ${new Date().toLocaleDateString()}`}
                  className="w-full px-3 py-2 bg-dark-bg-primary border border-dark-border-primary rounded-lg focus:outline-none focus:border-dark-accent-orange text-dark-text-primary placeholder-dark-text-muted"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowSaveDialog(false)}
                  className="flex-1 px-4 py-2 bg-dark-bg-elevated text-dark-text-primary rounded-lg hover:bg-dark-bg-primary transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveChat}
                  className="flex-1 px-4 py-2 bg-dark-accent-orange text-white rounded-lg hover:bg-dark-accent-orangeHover transition flex items-center justify-center gap-2"
                >
                  <Save className="h-4 w-4" />
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDebugModal && debugData && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-bg-secondary rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col border border-dark-border-primary">
            <div className="p-4 border-b border-dark-border-primary flex justify-between items-center bg-dark-bg-elevated rounded-t-lg">
              <h3 className="text-lg font-semibold text-dark-text-primary flex items-center gap-2">
                <Code className="h-5 w-5 text-dark-accent-orange" />
                Prompt Debugger
              </h3>
              <button
                onClick={() => setShowDebugModal(false)}
                className="text-dark-text-secondary hover:text-dark-text-primary"
              >
                ✕
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 font-mono text-xs md:text-sm">
              <div className="space-y-6">
                <div>
                  <h4 className="font-bold text-dark-text-primary mb-2 border-b border-dark-border-primary pb-1">System Prompt (Context & Instructions)</h4>
                  <pre className="bg-dark-bg-primary p-4 rounded-lg whitespace-pre-wrap text-dark-text-secondary">
                    {debugData.systemPrompt}
                  </pre>
                </div>
                <div>
                  <h4 className="font-bold text-dark-text-primary mb-2 border-b border-dark-border-primary pb-1">User Prompt (Question)</h4>
                  <pre className="bg-dark-bg-primary p-4 rounded-lg whitespace-pre-wrap text-dark-text-secondary">
                    {debugData.userPrompt}
                  </pre>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-dark-border-primary flex justify-end">
              <button
                onClick={() => setShowDebugModal(false)}
                className="px-4 py-2 bg-dark-accent-orange text-white rounded-lg hover:bg-dark-accent-orangeHover transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Component to handle the 3-section structured response with modern tabbed interface
 */
function StructuredMessage({ message, onCopy }: { message: ChatMessage, onCopy: () => void }) {
  // Default to summary if available, otherwise detail
  const [activeTab, setActiveTab] = useState<'summary' | 'detail' | 'citations'>(
    message.summary ? 'summary' : 'detail'
  );

  // If no summary exists (legacy messages), ensure detail is shown
  useEffect(() => {
    if (!message.summary && activeTab === 'summary') {
      setActiveTab('detail');
    }
  }, [message.summary, activeTab]);

  const tabs = [
    ...(message.summary ? [{
      id: 'summary' as const,
      label: 'Summary',
      icon: AlignLeft,
      badge: message.reading_time?.summary,
      available: true
    }] : []),
    {
      id: 'detail' as const,
      label: 'Detailed',
      icon: FileText,
      badge: message.reading_time?.detail,
      available: true
    },
    {
      id: 'citations' as const,
      label: 'Sources',
      icon: BookOpen,
      badge: message.citations?.length ? `${message.citations.length}` : undefined,
      available: message.citations && message.citations.length > 0
    }
  ].filter(tab => tab.available);

  return (
    <div className="bg-dark-bg-secondary rounded-xl border border-dark-border-primary overflow-hidden">
      {/* Modern Tab Navigation - scrollable on mobile so Sources tab is reachable */}
      <div className="flex items-center gap-2 p-2 bg-dark-bg-tertiary border-b border-dark-border-primary">
        {/* Scrollable tab strip: flex-1 min-w-0 allows horizontal scroll on small screens */}
        <div
          className="flex flex-1 min-w-0 overflow-x-auto overflow-y-hidden gap-1 -mx-1 px-1 scrollbar-thin"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  relative flex items-center gap-2 px-3 sm:px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-300 flex-shrink-0
                  ${isActive
                    ? 'bg-dark-bg-secondary text-dark-text-primary shadow-lg'
                    : 'text-dark-text-secondary hover:text-dark-text-primary hover:bg-dark-bg-secondary/50'
                  }
                `}
              >
                {/* Glowing effect for active tab */}
                {isActive && (
                  <div className="absolute inset-0 bg-gradient-to-r from-dark-accent-orange/20 to-dark-accent-pink/20 rounded-lg animate-pulse" />
                )}

                <Icon className={`h-4 w-4 relative z-10 flex-shrink-0 ${isActive ? 'text-dark-accent-orange' : ''}`} />
                <span className="relative z-10 whitespace-nowrap">{tab.label}</span>

                {tab.badge && (
                  <span className={`
                    relative z-10 text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0
                    ${isActive
                      ? 'bg-dark-accent-orange/20 text-dark-accent-orange'
                      : 'bg-dark-bg-primary text-dark-text-muted'
                    }
                  `}>
                    {tab.badge}
                  </span>
                )}

                {/* Active indicator line */}
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-dark-accent-orange to-dark-accent-pink rounded-b-lg" />
                )}
              </button>
            );
          })}
        </div>

        {/* Copy button - always visible, doesn't scroll away */}
        <button
          onClick={onCopy}
          className="flex-shrink-0 p-2 hover:bg-dark-bg-elevated rounded-lg text-dark-text-muted hover:text-dark-accent-orange transition-colors"
          title="Copy content"
        >
          <Copy className="h-4 w-4" />
        </button>
      </div>

      {/* Tab Content with smooth transitions */}
      <div className="relative min-h-[100px]">
        {/* Summary Tab */}
        {message.summary && (
          <div className={`
            transition-all duration-300 ease-in-out
            ${activeTab === 'summary' ? 'opacity-100 translate-x-0' : 'absolute opacity-0 translate-x-4 pointer-events-none'}
          `}>
            <div className="p-4 md:p-6 text-dark-text-primary text-sm leading-relaxed">
              {message.summary}
            </div>
          </div>
        )}

        {/* Detail Tab */}
        <div className={`
          transition-all duration-300 ease-in-out
          ${activeTab === 'detail' ? 'opacity-100 translate-x-0' : 'absolute opacity-0 translate-x-4 pointer-events-none'}
        `}>
          <div className="p-4 md:p-6">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              className="prose prose-sm max-w-none prose-invert"
            >
              {message.content}
            </ReactMarkdown>

            {/* Embedded Videos in Detail View */}
            {message.citations && message.citations.some(c => c.youtube_video_id) && (
              <div className="mt-6 pt-4 border-t border-dark-border-primary space-y-3">
                <p className="text-sm font-medium text-dark-accent-orange flex items-center gap-2">
                  <span>📹</span>
                  Video Sources
                </p>
                <div className="grid grid-cols-1 gap-4">
                  {message.citations
                    .filter(c => c.youtube_video_id)
                    .slice(0, 2)
                    .map((citation, idx) => (
                      <YouTubePlayer
                        key={idx}
                        videoId={citation.youtube_video_id!}
                        startTime={citation.start_timestamp || 0}
                        title={`${citation.document_title} - ${citation.master_name}`}
                        className="w-full"
                      />
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Citations Tab */}
        {message.citations && message.citations.length > 0 && (
          <div className={`
            transition-all duration-300 ease-in-out
            ${activeTab === 'citations' ? 'opacity-100 translate-x-0' : 'absolute opacity-0 translate-x-4 pointer-events-none'}
          `}>
            <div className="p-4 md:p-6">
              <SourceCitation citations={message.citations} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
