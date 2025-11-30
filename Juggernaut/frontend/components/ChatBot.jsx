import React, { useState, useRef, useEffect } from 'react';
// 👇 CHANGED: Import the official stable SDK
import { GoogleGenerativeAI } from "@google/generative-ai";
import { MessageCircle, X, Send, Loader2, Bot, User as UserIcon, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
// import { translations } from '../translations'; 

export const ChatBot = ({ language }) => {
  const [isOpen, setIsOpen] = useState(false); 
  const [messages, setMessages] = useState([
    { id: 'welcome', role: 'model', text: 'Hello! I am your Agri-Sentry AI assistant. How can I help you with your crops today?' }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const messagesEndRef = useRef(null);
  const chatSessionRef = useRef(null);

  // 👇 SCROLL LOGIC
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  // 👇 GEMINI INITIALIZATION LOGIC
  const initializeChat = async () => {
    if (!chatSessionRef.current) {
      try {
        // Access key based on your build tool (Create React App uses process.env, Vite uses import.meta.env)
        const API_KEY = process.env.REACT_APP_GEMINI_API_KEY || "YOUR_FALLBACK_KEY"; 
        
        const genAI = new GoogleGenerativeAI(API_KEY);
        
        // Use a fast, cost-effective model like gemini-1.5-flash
        const model = genAI.getGenerativeModel({ 
          model: "gemini-1.5-flash",
          systemInstruction: `You are an expert agricultural AI assistant for the Agri-Sentry platform. 
          Current user language is ${language}. 
          You are helpful, concise, and knowledgeable about farming, crop diseases, supply verification, and weather patterns. 
          Keep responses professional yet friendly. Do not use markdown formatting like **bold** too often, keep it plain text friendly.`
        });

        // Start the chat session
        chatSessionRef.current = model.startChat({
          history: [
            {
              role: "user",
              parts: [{ text: "Hello" }],
            },
            {
              role: "model",
              parts: [{ text: "Hello! I am your Agri-Sentry AI assistant. How can I help you with your crops today?" }],
            },
          ],
        });
        
      } catch (error) {
        console.error("Error initializing Gemini:", error);
      }
    }
  };

  // Initialize when chat opens
  useEffect(() => {
    if (isOpen) {
      initializeChat();
    }
  }, [isOpen, language]);

  // 👇 SEND MESSAGE LOGIC
  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;

    // 1. Add User Message to UI
    const userMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: inputValue
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      // Ensure chat is initialized
      if (!chatSessionRef.current) {
         await initializeChat();
      }
      
      if (chatSessionRef.current) {
        // 2. Send to Gemini
        const result = await chatSessionRef.current.sendMessage(userMessage.text);
        const response = await result.response;
        const text = response.text();
        
        // 3. Add Model Response to UI
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'model',
          text: text
        }]);
      }
    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: "I'm having trouble connecting to the network. Please check your internet or API Key."
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const bottomOffsetClass = 'bottom-[75px]'; 

  return (
    <>
      {/* Floating Toggle Button */}
      <motion.button
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setIsOpen(true)}
        className={`fixed ${bottomOffsetClass} right-4 md:bottom-6 md:right-6 z-50 p-3 md:p-4 rounded-full shadow-[0_0_30px_rgba(163,230,53,0.3)] transition-all duration-300 ${
          isOpen ? 'scale-0 opacity-0 pointer-events-none' : 'bg-lime-400 text-emerald-950 hover:bg-lime-300'
        }`}
      >
        <MessageCircle size={28} className='md:size-8' strokeWidth={2.5} />
      </motion.button>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className={`fixed inset-0 md:inset-auto md:bottom-6 md:right-6 
                        w-full h-full max-h-none 
                        md:w-[400px] md:h-[600px] md:max-h-[80vh] 
                        bg-slate-900/95 backdrop-blur-2xl rounded-none md:rounded-[2rem] shadow-2xl 
                        flex flex-col overflow-hidden z-50 border border-white/10 font-sans`}
          >
            {/* Header */}
            <div className="p-4 bg-emerald-950/50 border-b border-white/5 flex justify-between items-center shrink-0 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-lime-400/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
              
              <div className="flex items-center gap-3 relative z-10">
                <div className="p-2 bg-lime-400/20 rounded-xl backdrop-blur-md border border-lime-400/20">
                  <Bot size={24} className="text-lime-400" />
                </div>
                <div>
                  <h3 className="font-bold text-lg leading-tight text-white">Agri-Sentry AI</h3>
                  <p className="text-[10px] text-emerald-200/70 flex items-center gap-1 font-medium tracking-wide">
                    <span className="w-1.5 h-1.5 bg-lime-400 rounded-full animate-pulse"></span>
                    POWERED BY GEMINI
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-white/10 rounded-full transition-colors relative z-10 text-slate-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-black/20 custom-scrollbar">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex items-end gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border border-white/5 ${
                    msg.role === 'user' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-lime-500/20 text-lime-400'
                  }`}>
                    {msg.role === 'user' ? <UserIcon size={16} /> : <Sparkles size={16} />}
                  </div>
                  <div
                    className={`max-w-[80%] p-3.5 rounded-2xl text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-emerald-600 text-white rounded-br-none shadow-lg'
                        : 'bg-white/5 text-slate-200 border border-white/5 rounded-bl-none shadow-md backdrop-blur-sm'
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex items-end gap-2">
                   <div className="w-8 h-8 rounded-full bg-lime-500/20 text-lime-400 border border-white/5 flex items-center justify-center shrink-0">
                    <Sparkles size={16} />
                  </div>
                  <div className="bg-white/5 p-4 rounded-2xl rounded-bl-none border border-white/5 shadow-sm">
                    <Loader2 size={18} className="animate-spin text-lime-400" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-slate-950/50 border-t border-white/5 shrink-0">
              <div className="relative flex items-center gap-2">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="Ask about crops, pests, or weather..."
                  disabled={isLoading}
                  className="w-full pl-4 pr-12 py-3.5 bg-black/40 border border-white/10 rounded-xl focus:outline-none focus:border-lime-400/50 focus:ring-1 focus:ring-lime-400/20 transition-all text-sm text-white placeholder:text-slate-500"
                />
                <button
                  onClick={handleSend}
                  disabled={!inputValue.trim() || isLoading}
                  className="absolute right-2 p-2 bg-lime-400 text-emerald-950 rounded-lg hover:bg-lime-300 disabled:opacity-50 disabled:hover:bg-lime-400 transition-colors shadow-[0_0_10px_rgba(163,230,53,0.3)]"
                >
                  <Send size={16} strokeWidth={2.5} />
                </button>
              </div>
              <div className="text-center mt-2">
                 <p className="text-[10px] text-slate-500 font-medium">Agri-Sentry • Gemini 1.5 Flash</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};