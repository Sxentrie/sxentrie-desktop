import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ChatMessage } from './ChatMessage'
import { ChatInput } from './ChatInput'
import { MessageCircle } from 'lucide-react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export const ChatContainer = () => {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Listen for chunks
    const cleanupChunk = window.secureApi.onGeminiChunk((chunk) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (last && last.role === 'assistant') {
          return [
            ...prev.slice(0, -1),
            { ...last, content: last.content + chunk }
          ]
        } else {
          return [
            ...prev,
            { id: Date.now().toString(), role: 'assistant', content: chunk }
          ]
        }
      })
    })

    const cleanupEnd = window.secureApi.onGeminiEnd(() => {
      setIsLoading(false)
    })

    const cleanupError = window.secureApi.onGeminiError((error) => {
      setIsLoading(false)
      setMessages((prev) => [
        ...prev,
        { id: Date.now().toString(), role: 'assistant', content: `Error: ${error}` }
      ])
    })

    return () => {
      cleanupChunk()
      cleanupEnd()
      cleanupError()
    }
  }, [])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSubmit = () => {
    if (!input.trim() || isLoading) return

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input
    }

    const newHistory = [...messages, userMsg]
    setMessages(newHistory)
    setIsLoading(true)

    // Map to Vertex/Google AI format: { role: string, parts: [{ text: string }] }
    const formattedHistory = newHistory.map((m) => ({
      role: m.role,
      parts: [{ text: m.content }]
    }))

    window.secureApi.geminiChat(formattedHistory)
    setInput('')
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      {/* Messages area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-4 scroll-smooth"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, type: 'spring' }}
              className="p-4 bg-white rounded-3xl shadow-sm border border-slate-200"
            >
              <MessageCircle className="w-12 h-12 text-blue-500" />
            </motion.div>
            <div className="text-center">
              <h3 className="text-lg font-medium text-slate-600">Start a Conversation</h3>
              <p className="text-sm">Gemini is ready to help you.</p>
            </div>
          </div>
        ) : (
          <AnimatePresence>
            {messages.map((msg) => (
              <ChatMessage key={msg.id} role={msg.role} content={msg.content} />
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Input area */}
      <div className="p-4 bg-white border-t border-slate-200 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.05)]">
        <div className="max-w-3xl mx-auto">
          <ChatInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            loading={isLoading}
            disabled={isLoading}
          />
        </div>
      </div>
    </div>
  )
}
