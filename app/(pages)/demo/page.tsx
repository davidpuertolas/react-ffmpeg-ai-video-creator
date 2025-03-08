'use client'

import { useState, useRef } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string | {
    type: 'text' | 'image_url'
    text?: string
    image_url?: {
      url: string
    }
  }[]
}

// Lista de modelos disponibles
const AVAILABLE_MODELS = [
  { id: 'deepseek/deepseek-chat:free', name: 'Deepseek Chat' },
  { id: 'google/gemini-2.0-flash-lite-preview-02-05:free', name: 'Gemini 2.0' },
  { id: 'qwen/qwq-32b:free', name: 'Qwen 32B' }
]

export default function DemoPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [selectedModel, setSelectedModel] = useState(AVAILABLE_MODELS[0].id)
  const [imageUrl, setImageUrl] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if ((!input.trim() && !imageUrl) || isLoading) return

    let newMessage: Message

    if (selectedModel === 'google/gemini-2.0-flash-lite-preview-02-05:free') {
      const content: Message['content'] = []

      if (input.trim()) {
        content.push({
          type: 'text',
          text: input.trim()
        })
      }

      if (imageUrl) {
        content.push({
          type: 'image_url',
          image_url: {
            url: imageUrl
          }
        })
      }

      newMessage = { role: 'user', content }
    } else {
      newMessage = { role: 'user', content: input }
    }

    setMessages(prev => [...prev, newMessage])
    setInput('')
    setImageUrl('')
    setIsLoading(true)

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_OPENROUTER_API_KEY}`,
          'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
          'X-Title': process.env.NEXT_PUBLIC_SITE_NAME || 'Chat Demo',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [...messages, newMessage]
        })
      })

      const data = await response.json()
      const assistantMessage: Message = {
        role: 'assistant',
        content: data.choices[0].message.content
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setImageUrl(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4">
      <div className="bg-white rounded-lg shadow-lg p-6 min-h-[500px] flex flex-col">
        {/* Selector de modelo */}
        <div className="mb-4">
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="w-full p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {AVAILABLE_MODELS.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 mb-4">
          {messages.map((message, i) => (
            <div
              key={i}
              className={`p-4 rounded-lg ${
                message.role === 'user'
                  ? 'bg-blue-100 ml-auto max-w-[80%]'
                  : 'bg-gray-100 mr-auto max-w-[80%]'
              }`}
            >
              {Array.isArray(message.content) ? (
                <div className="space-y-2">
                  {message.content.map((content, j) => (
                    <div key={j}>
                      {content.type === 'text' && content.text}
                      {content.type === 'image_url' && (
                        <img
                          src={content.image_url?.url}
                          alt="Uploaded content"
                          className="max-w-full rounded-lg"
                        />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                message.content
              )}
            </div>
          ))}
          {isLoading && (
            <div className="bg-gray-100 rounded-lg p-4 mr-auto max-w-[80%]">
              Pensando...
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-2">
          {imageUrl && (
            <div className="relative w-32 h-32 mb-2">
              <img
                src={imageUrl}
                alt="Preview"
                className="w-full h-full object-cover rounded-lg"
              />
              <button
                type="button"
                onClick={() => setImageUrl('')}
                className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 text-xs"
              >
                ×
              </button>
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Escribe un mensaje..."
              className="flex-1 p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {selectedModel === 'google/gemini-2.0-flash-lite-preview-02-05:free' && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
              >
                📷
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
            >
              Enviar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
