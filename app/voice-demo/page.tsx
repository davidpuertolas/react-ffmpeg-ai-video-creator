'use client';

import { useState, useRef } from 'react';

export default function VoiceDemo() {
  const [text, setText] = useState("Hola, este es un video de TikTok generado con inteligencia artificial.");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const generateSpeech = async () => {
    if (!text.trim()) {
      setError("Por favor, introduce algún texto para generar voz");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Si hay un audio previo, liberar recursos
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        setAudioUrl(null);
      }

      const response = await fetch('/api/tiktok-video/generate-speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Error ${response.status}: ${response.statusText}`);
      }

      const audioBlob = await response.blob();
      const url = URL.createObjectURL(audioBlob);
      setAudioUrl(url);

      if (audioRef.current) {
        audioRef.current.load();
        audioRef.current.play();
      }
    } catch (err) {
      console.error('Error generando voz:', err);
      setError(err.message || 'Error desconocido al generar la voz');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Demo de Text-to-Speech</h1>

      <div className="bg-white rounded-lg shadow-md p-6 space-y-6">
        <p className="text-gray-700">
          Esta demo convierte texto a voz usando la API de ElevenLabs.
        </p>

        {/* Área de texto */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Texto a convertir en voz
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Escribe el texto que quieres convertir a voz..."
          />
          <p className="mt-1 text-xs text-gray-500">
            {text.length} caracteres
          </p>
        </div>

        {/* Botón de generación */}
        <div>
          <button
            onClick={generateSpeech}
            disabled={isLoading || !text.trim()}
            className={`
              w-full py-3 px-4 rounded-md shadow-sm text-sm font-medium text-white
              ${isLoading || !text.trim()
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'}
              transition-all duration-200
            `}
          >
            {isLoading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Generando audio...
              </span>
            ) : 'Generar voz'}
          </button>
        </div>

        {/* Mensajes de error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Reproductor de audio */}
        {audioUrl && (
          <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Audio generado:</h3>
            <audio ref={audioRef} controls className="w-full">
              <source src={audioUrl} type="audio/mpeg" />
              Tu navegador no soporta el elemento de audio.
            </audio>
            <div className="mt-3 flex justify-end">
              <a
                href={audioUrl}
                download={`audio_${new Date().getTime()}.mp3`}
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Descargar audio
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
