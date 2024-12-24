"use client";

import { useState, useEffect, useRef } from "react";
import { ArrowRightIcon } from "@heroicons/react/24/outline";
import OpenAI from 'openai';
import html2canvas from 'html2canvas';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

const steps = [
  { id: 1, name: "URL" },
  { id: 2, name: "Select" },
  { id: 3, name: "Customize" },
  { id: 4, name: "Generate" },
];

interface RedditData {
  title: string;
  content: string;
  author: string;
  upvotes: number;
  comments: number;
  commentsList: {
    author: string;
    content: string;
    upvotes: number;
    isSubmitter: boolean;
  }[];
  subreddit: string;
  isOver18: boolean;
  created: Date;
}

// Inicializar OpenAI
const openai = new OpenAI({
  apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true // Solo para desarrollo
});

// Añadir función para generar audio
const generateSpeech = async (text: string) => {
  try {
    console.log('🎙️ Generating speech for:', text.substring(0, 50) + '...');
    console.log('Using voice model:', "tts-1");

    const startTime = Date.now();
    const response = await openai.audio.speech.create({
      model: "tts-1",
      voice: "alloy",
      input: text,
    });
    const endTime = Date.now();

    const audioBlob = await response.blob();
    const duration = endTime - startTime;
    const size = audioBlob.size;
    const cost = (text.length / 1000) * 0.015; // $0.015 per 1K characters

    console.log('🎉 Speech generated successfully!');
    console.log('📊 Stats:', {
      duration: `${duration}ms`,
      size: `${(size / 1024).toFixed(2)}KB`,
      characters: text.length,
      estimatedCost: `$${cost.toFixed(4)}`,
    });

    return URL.createObjectURL(audioBlob);
  } catch (error) {
    console.error('❌ Error generating speech:', error);
    return null;
  }
};

export default function RedditVideoPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [redditUrl, setRedditUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [storyData, setStoryData] = useState<RedditData | null>(null);
  const [urlError, setUrlError] = useState('');
  const [selectedComments, setSelectedComments] = useState<number[]>([]);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [loadedImages, setLoadedImages] = useState<string[]>([]);
  const [audioFiles, setAudioFiles] = useState<{[key: string]: {audio: string, text: string}}>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [avatarIndex, setAvatarIndex] = useState<number>(Math.floor(Math.random() * 7));
  const [avatarIndices, setAvatarIndices] = useState<number[]>([]);

  // Añadir una referencia al video y al canvas
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const isValidRedditUrl = (url: string) => {
    const redditPattern = /^https?:\/\/(www\.)?reddit\.com\/r\/[\w-]+\/comments\/[\w-]+\/.*/;
    return redditPattern.test(url);
  };

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isValidRedditUrl(redditUrl)) {
      setUrlError('Please enter a valid Reddit post URL');
      return;
    }

    setIsLoading(true);
    setUrlError('');

    try {
      // Hacer la petición a través de nuestro endpoint
      const response = await fetch(`/api/reddit?url=${encodeURIComponent(redditUrl)}`);
      if (!response.ok) throw new Error('Failed to fetch Reddit data');

      const data = await response.json();

      // Extraer los datos del post
      const post = data[0].data.children[0].data;

      // Extraer solo los comentarios de primer nivel (no respuestas)
      const comments = data[1].data.children
        .filter((comment: any) => comment.kind === 't1' && !comment.data.collapsed)
        .map((comment: any) => ({
          author: comment.data.author,
          content: comment.data.body,
          upvotes: comment.data.ups,
          isSubmitter: comment.data.is_submitter
        }))
        .slice(0, 10); // Obtener solo los primeros 10 comentarios

      const redditData: RedditData = {
        title: post.title,
        content: post.selftext,
        author: post.author,
        upvotes: post.ups,
        comments: post.num_comments,
        commentsList: comments,
        subreddit: post.subreddit_name_prefixed,
        isOver18: post.over_18,
        created: new Date(post.created_utc * 1000)
      };

      // Loguear los datos en formato JSON
      console.log('Reddit Post Data:', JSON.stringify(redditData, null, 2));

      setStoryData(redditData);
      setIsLoading(false);
      setCurrentStep(2);

    } catch (error) {
      console.error('Error fetching Reddit data:', error);
      setUrlError(error instanceof Error ? error.message : 'Failed to fetch Reddit data. Please try again.');
      setIsLoading(false);
    }
  };

  const toggleComment = (index: number) => {
    setSelectedComments(prev =>
      prev.includes(index)
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  const handlePlayPause = () => {
    if (!isPlaying) {
      if (currentMessageIndex === -1) {
        setCurrentMessageIndex(0);
      }
    }
    setIsPlaying(!isPlaying);
  };

  useEffect(() => {
    let timer: NodeJS.Timeout;

    if (isPlaying) {
      timer = setTimeout(() => {
        const maxIndex = selectedComments.length;
        if (currentMessageIndex < maxIndex) {
          setCurrentMessageIndex(prev => prev + 1);
        } else {
          setIsPlaying(false);
          setCurrentMessageIndex(-1);
        }
      }, 3000);
    }

    return () => clearTimeout(timer);
  }, [currentMessageIndex, isPlaying, selectedComments.length]);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const preloadImages = () => {
    const images = [
      '/redditimages/1.jpg',
      '/redditimages/2.jpg',
      '/redditimages/3.jpg',
      '/redditimages/4.jpg',
      '/redditimages/5.jpg',
      '/redditimages/6.jpg',
      '/redditimages/7.jpg',
    ];

    images.forEach(src => {
      const img = new Image();
      img.src = src;
      img.onload = () => {
        setLoadedImages(prev => [...prev, src]);
      };
      img.onerror = () => {
        console.warn(`Failed to load image: ${src}`);
      };
    });
  };

  const getRandomProfileImage = () => {
    if (loadedImages.length === 0) {
      return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23CBD5E1"%3E%3Cpath d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z"%3E%3C/path%3E%3C/svg%3E';
    }
    return loadedImages[Math.floor(Math.random() * loadedImages.length)];
  };

  // Añadir función para generar números aleatorios
  const getRandomStats = () => {
    return {
      likes: Math.floor(Math.random() * 10000) + 100,
      comments: Math.floor(Math.random() * 1000) + 10
    };
  };

  // Añadir función para generar fechas posteriores
  const getCommentDate = (baseDate: Date, index: number) => {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + index + 1); // Cada comentario será un día después
    return date;
  };

  useEffect(() => {
    preloadImages();
  }, []);

  // Añadir función para generar el video completo
  const generateVideo = async () => {
    console.log('🎬 Starting demo generation process');
    setIsGenerating(true);
    setProgress(0);

    try {
      // Simular generación de audio
      const demoAudioUrl = '/demo-audio.mp3'; // Puedes añadir un audio estático en public/

      // Simular progreso
      for (let i = 0; i <= 100; i += 10) {
        setProgress(i);
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // Simular audios generados
      setAudioFiles({
        title: { audio: demoAudioUrl, text: storyData.title },
        comments: selectedComments.map(index => ({
          audio: demoAudioUrl,
          text: storyData.commentsList[index].content,
          author: storyData.commentsList[index].author
        }))
      });

      console.log('✅ Demo generation complete!');

    } catch (error) {
      console.error('❌ Error during demo generation:', error);
      alert('Failed to generate demo');
    } finally {
      setIsGenerating(false);
      setProgress(100);
    }
  };

  // Añadir función para reproducir secuencialmente
  const playAllAudios = async () => {
    setCurrentMessageIndex(0);

    // Simular reproducción del título
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Simular reproducción de comentarios
    for (let i = 0; i < selectedComments.length; i++) {
      setCurrentMessageIndex(i + 1);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // Reiniciar después de reproducir todo
    await new Promise(resolve => setTimeout(resolve, 1000));
    setCurrentMessageIndex(-1);
  };

  // Iniciar reproducción automática cuando se generen los audios
  useEffect(() => {
    if (audioFiles.title && currentStep === 4) {
      playAllAudios();
    }
  }, [audioFiles, currentStep]);

  useEffect(() => {
    if (currentStep === 4) {
      console.log('🎬 Iniciando preview automática');
      // Establecer video de fondo
      setVideoUrl('/minecraft.mp4');

      // Iniciar reproducción automática de mensajes
      const playMessages = async () => {
        // Mostrar título primero
        setCurrentMessageIndex(0);
        await new Promise(resolve => setTimeout(resolve, 3000)); // 3 segundos para el título

        // Reproducir cada comentario
        for (let i = 0; i < selectedComments.length; i++) {
          setCurrentMessageIndex(i + 1);
          await new Promise(resolve => setTimeout(resolve, 3000)); // 3 segundos por comentario
        }

        // Volver a empezar
        playMessages();
      };

      // Iniciar la reproducción
      playMessages();

      // Cleanup
      return () => {
        setCurrentMessageIndex(-1);
      };
    }
  }, [currentStep, selectedComments.length]);

  useEffect(() => {
    // Seleccionar avatares aleatorios para cada mensaje
    const indices = Array.from({ length: selectedComments.length + 1 }, () => Math.floor(Math.random() * 7));
    setAvatarIndices(indices);
  }, [selectedComments.length]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const video = videoRef.current;

    if (!ctx || !video) return;

    // Configurar dimensiones del canvas
    canvas.width = 1080;
    canvas.height = 1920;

    // Generar números aleatorios para likes y comentarios al inicio
    const initialLikes = Math.floor(Math.random() * 100) + 1;
    const initialComments = Math.floor(Math.random() * 100) + 1;

    // Preload images
    const images = Array.from({ length: 7 }, (_, i) => {
      const img = new Image();
      img.src = `/redditimages/${i + 1}.jpg`;
      return img;
    });

    const drawFrame = () => {
      // Dibujar el video
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Dibujar el overlay semitransparente
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Dibujar el contenido actual
      if (currentMessageIndex >= 0 && storyData) {
        // Configurar estilos base
        const cardWidth = canvas.width * 0.8;
        const cardX = (canvas.width - cardWidth) / 2;
        let cardHeight = 200; // Altura base

        // Ajustar altura según el contenido
        const content = currentMessageIndex === 0 ? storyData.title : storyData.commentsList[selectedComments[currentMessageIndex - 1]].content;
        const lines = Math.ceil(content.length / 44); // Aproximación de líneas
        cardHeight += currentMessageIndex === 0 ? lines * 80 : lines * 47;

        const cardY = (canvas.height - cardHeight) / 2.3;

        // Dibujar card background
        ctx.fillStyle = isDarkMode ? '#1A1A1A' : '#FFFFFF';
        ctx.strokeStyle = isDarkMode ? '#374151' : '#D1D5DB';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(cardX, cardY, cardWidth, cardHeight, 12);
        ctx.fill();
        ctx.stroke();

        // Usar imagen de usuario específica para cada mensaje
        const userImage = images[avatarIndices[currentMessageIndex]];
        ctx.save();
        ctx.beginPath();
        ctx.arc(cardX + 45, cardY + 45, 25, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(userImage, cardX + 20, cardY + 20, 50, 50);
        ctx.restore();

        if (currentMessageIndex === 0) {
          // Dibujar post original
          ctx.fillStyle = isDarkMode ? '#FFFFFF' : '#000000';
          ctx.font = 'bold 36px Arial';
          ctx.fillText(storyData.author, cardX + 80, cardY + 50);

          ctx.fillStyle = isDarkMode ? '#9CA3AF' : '#6B7280';
          ctx.font = '28px Arial';
          ctx.fillText(`${storyData.subreddit} • 25/12/2024`, cardX + 80, cardY + 90);

          // Título
          ctx.fillStyle = isDarkMode ? '#FFFFFF' : '#000000';
          ctx.font = 'bold 45px Arial';
          wrapText(ctx, storyData.title, cardX + 20, cardY + 165, cardWidth - 40, 50);

        } else if (currentMessageIndex > 0) {
          // Dibujar comentario
          const comment = storyData.commentsList[selectedComments[currentMessageIndex - 1]];

          ctx.fillStyle = isDarkMode ? '#FFFFFF' : '#000000';
          ctx.font = 'bold 36px Arial';
          ctx.fillText(`u/${comment.author}`, cardX + 80, cardY + 50);

          // Fecha de creación
          ctx.fillStyle = isDarkMode ? '#9CA3AF' : '#6B7280';
          ctx.font = '28px Arial';
          ctx.fillText('25/12/2024', cardX + 80, cardY + 90);

          if (comment.isSubmitter) {
            const opWidth = ctx.measureText('OP').width + 20;
            ctx.fillStyle = isDarkMode ? '#1E40AF' : '#DBEAFE';
            ctx.beginPath();
            ctx.roundRect(cardX + 80 + ctx.measureText(`u/${comment.author}`).width + 10, cardY + 20, opWidth, 30, 15);
            ctx.fill();

            ctx.fillStyle = isDarkMode ? '#93C5FD' : '#2563EB';
            ctx.font = 'bold 24px Arial';
            ctx.fillText('OP', cardX + 85 + ctx.measureText(`u/${comment.author}`).width + 10, cardY + 45);
          }

          // Contenido del comentario
          ctx.fillStyle = isDarkMode ? '#FFFFFF' : '#000000';
          ctx.font = '38px Arial';
          wrapText(ctx, comment.content, cardX + 20, cardY + 155, cardWidth - 40, 40);
        }

        // Dibujar likes y comentarios
        ctx.fillStyle = '#6B7280';
        ctx.font = '28px Arial';
        ctx.fillText(`❤️ ${initialLikes}`, cardX + 20, cardY + cardHeight - 40);
        ctx.fillText(`💬 ${initialComments}`, cardX + 150, cardY + cardHeight - 40);
      }

      requestAnimationFrame(drawFrame);
    };

    // Función helper para envolver texto
    const wrapText = (
      ctx: CanvasRenderingContext2D,
      text: string,
      x: number,
      y: number,
      maxWidth: number,
      lineHeight: number
    ) => {
      const words = text.split(' ');
      let line = '';
      let currentY = y;

      for (const word of words) {
        const testLine = line + word + ' ';
        const metrics = ctx.measureText(testLine);

        if (metrics.width > maxWidth) {
          ctx.fillText(line, x, currentY);
          line = word + ' ';
          currentY += lineHeight;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line, x, currentY);
    };

    // Iniciar la animación
    video.play();
    drawFrame();

    return () => {
      video.pause();
    };
  }, [currentMessageIndex, isDarkMode, selectedComments, storyData, avatarIndices]);

  // Agregar esta función de descarga
  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    console.log('🎥 Iniciando grabación para descarga...');

    const stream = canvas.captureStream(30);
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp8',
      videoBitsPerSecond: 8000000
    });

    const chunks: Blob[] = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        console.log(`📦 Chunk recibido: ${e.data.size} bytes`);
        chunks.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      console.log('⏹️ Grabación completada');
      const blob = new Blob(chunks, { type: 'video/webm' });
      console.log(`📊 Tamaño total del video: ${(blob.size / 1024 / 1024).toFixed(2)}MB`);

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reddit-video-${Date.now()}.webm`;
      a.click();
      URL.revokeObjectURL(url);
    };

    // Grabar durante el ciclo completo de mensajes
    const duration = (selectedComments.length + 1) * 3000; // 3 segundos por mensaje
    console.log(`⏱️ Duración total: ${duration/1000}s`);

    mediaRecorder.start();
    console.log('▶️ Iniciando grabación');

    setTimeout(() => {
      mediaRecorder.stop();
    }, duration);
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-center">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  currentStep >= step.id
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 text-gray-600"
                }`}
              >
                {step.id}
              </div>
              <div
                className={`text-sm font-medium mx-2 ${
                  currentStep >= step.id ? "text-gray-900" : "text-gray-500"
                }`}
              >
                {step.name}
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`w-20 h-0.5 mx-2 ${
                    currentStep > step.id ? "bg-blue-600" : "bg-gray-200"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step 1: URL Input */}
      {currentStep === 1 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold mb-4">Enter Reddit Post URL</h2>
          <form onSubmit={handleUrlSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reddit URL
              </label>
              <input
                type="url"
                value={redditUrl}
                onChange={(e) => {
                  setRedditUrl(e.target.value);
                  setUrlError('');
                }}
                placeholder="https://reddit.com/r/AmItheAsshole/comments/..."
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  urlError ? 'border-red-500' : 'border-gray-300'
                }`}
                required
              />
              {urlError && (
                <p className="mt-1 text-sm text-red-500">{urlError}</p>
              )}
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  Next
                  <ArrowRightIcon className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* Step 2: Select Comments */}
      {currentStep === 2 && storyData && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold mb-4">Select Comments</h2>
          <div className="flex gap-6">
            {/* Post fijo en la izquierda */}
            <div className="w-1/2 sticky top-4 self-start bg-gray-50 rounded-lg p-4 border border-gray-200">
              <div className="text-sm text-gray-500 mb-2 flex items-center justify-between">
                <span>{storyData.subreddit}</span>
                <span>{new Date(storyData.created).toLocaleDateString()}</span>
              </div>
              <h3 className="text-xl font-bold mb-3">{storyData.title}</h3>
              <div className="prose prose-sm max-w-none">
                <p className="text-gray-700 whitespace-pre-line">{storyData.content}</p>
              </div>
              <div className="mt-4 text-sm text-gray-500 flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <span>Posted by u/{storyData.author}</span>
                </span>
                <span>•</span>
                <span>{storyData.upvotes.toLocaleString()} upvotes</span>
              </div>
            </div>

            {/* Lista de comentarios seleccionables */}
            <div className="w-1/2 space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-medium">Select Comments</h3>
                <span className="text-sm text-gray-500">
                  {selectedComments.length} selected
                </span>
              </div>
              <div className="space-y-3">
                {storyData.commentsList.map((comment, index) => (
                  <div
                    key={index}
                    className={`bg-white rounded-lg border p-4 cursor-pointer transition-all ${
                      selectedComments.includes(index)
                        ? "border-blue-500 shadow-sm"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                    onClick={() => toggleComment(index)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 text-sm">
                        <span className={`font-medium ${comment.isSubmitter ? "text-blue-500" : "text-gray-700"}`}>
                          u/{comment.author}
                          {comment.isSubmitter && <span className="text-xs ml-1">(OP)</span>}
                        </span>
                        <span>•</span>
                        <span className="text-gray-500">{comment.upvotes.toLocaleString()} upvotes</span>
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        selectedComments.includes(index)
                          ? "bg-blue-500 border-blue-500 text-white"
                          : "border-gray-300"
                      }`}>
                        {selectedComments.includes(index) && (
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <p className="text-gray-700 text-sm">{comment.content}</p>
                  </div>
                ))}
              </div>
              <div className="sticky bottom-4 bg-white p-4 border-t mt-6">
                <button
                  onClick={() => setCurrentStep(3)}
                  className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
                >
                  Continue with {selectedComments.length} comments
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Customize */}
      {currentStep === 3 && storyData && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold mb-4">Customize Video</h2>
          <div className="flex gap-6">
            {/* Preview lado izquierdo */}
            <div className="w-1/2">
              <div className="sticky top-4">
                <h3 className="font-medium mb-4">Preview</h3>
                <div className="relative aspect-[9/16] bg-black rounded-lg overflow-hidden">
                  {/* Video de fondo */}
                  <video
                    ref={videoRef}
                    className="absolute inset-0 w-full h-full object-cover"
                    src="/minecraft.mp4"
                    autoPlay
                    loop
                    muted
                  />

                  {/* Overlay con el contenido */}
                  <div className="absolute inset-0 bg-black/50">
                    <div className="relative h-full flex flex-col">
                      {/* Área de mensajes */}
                      <div className="flex-1 p-4 flex items-center justify-center">
                        {currentMessageIndex === 0 && (
                          <div className={`w-full max-w-[300px] ${
                            isDarkMode ? 'bg-gray-950 text-gray-100' : 'bg-white text-gray-900'
                          } rounded-xl shadow-[0_8px_16px_rgba(0,0,0,0.1)] p-3 animate-fade-in`}>
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-8 h-8 rounded-full overflow-hidden">
                                <img src={getRandomProfileImage()} alt="Profile" className="w-full h-full object-cover" />
                              </div>
                              <div className="flex-1">
                                <div className="flex flex-col">
                                  <span className="font-medium">u/{storyData.author}</span>
                                  <span className={`text-xs ${
                                    isDarkMode ? 'text-gray-400' : 'text-gray-500'
                                  }`}>
                                    {storyData.subreddit} • {new Date(storyData.created).toLocaleDateString()}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <p className="text-lg font-bold mb-2">{storyData.title}</p>
                            {/* Footer con stats */}
                            <div className="flex items-center gap-4 mt-3">
                              <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                                </svg>
                                <span>{storyData.upvotes.toLocaleString()}</span>
                              </div>
                              <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2z" />
                                </svg>
                                <span>{storyData.comments.toLocaleString()}</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {currentMessageIndex > 0 && (
                          <div className={`w-full max-w-[300px] ${
                            isDarkMode ? 'bg-gray-950 text-gray-100' : 'bg-white text-gray-900'
                          } rounded-xl shadow-[0_8px_16px_rgba(0,0,0,0.1)] p-3 animate-fade-in`}>
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-7 h-7 rounded-full overflow-hidden">
                                <img src={getRandomProfileImage()} alt="Profile" className="w-full h-full object-cover" />
                              </div>
                              <div className="flex-1">
                                <div className="flex flex-col">
                                  <span className="font-medium">
                                    u/{storyData.commentsList[selectedComments[currentMessageIndex - 1]].author}
                                    {storyData.commentsList[selectedComments[currentMessageIndex - 1]].isSubmitter && (
                                      <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs font-medium ${
                                        isDarkMode ? 'bg-blue-900 text-blue-300' : 'bg-blue-100 text-blue-600'
                                      }`}>
                                        OP
                                      </span>
                                    )}
                                  </span>
                                  <span className={`text-xs ${
                                    isDarkMode ? 'text-gray-400' : 'text-gray-500'
                                  }`}>
                                    • {getCommentDate(storyData.created, selectedComments[currentMessageIndex - 1]).toLocaleDateString()}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <p className="text-sm mb-3">{storyData.commentsList[selectedComments[currentMessageIndex - 1]].content}</p>
                            {/* Footer con stats aleatorios */}
                            <div className="flex items-center gap-4">
                              <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                                </svg>
                                <span>{getRandomStats().likes.toLocaleString()}</span>
                              </div>
                              <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2z" />
                                </svg>
                                <span>{getRandomStats().comments.toLocaleString()}</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Controles */}
                      <div className="p-4 flex items-center justify-center gap-4">
                        <button
                          onClick={() => setCurrentMessageIndex(prev => Math.max(-1, prev - 1))}
                          className="p-2 rounded-full bg-white/20 hover:bg-white/30 text-white"
                          disabled={currentMessageIndex <= -1}
                        >
                          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                          </svg>
                        </button>

                        <button
                          onClick={handlePlayPause}
                          className="p-2 rounded-full bg-white/20 hover:bg-white/30 text-white"
                        >
                          {isPlaying ? (
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          ) : (
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          )}
                        </button>

                        <button
                          onClick={() => setCurrentMessageIndex(prev => Math.min(selectedComments.length, prev + 1))}
                          className="p-2 rounded-full bg-white/20 hover:bg-white/30 text-white"
                          disabled={currentMessageIndex >= selectedComments.length}
                        >
                          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Customización lado derecho */}
            <div className="w-1/2 space-y-6">
              <div>
                <h3 className="font-medium mb-4">Customize Options</h3>
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Voice
                    </label>
                    <select className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                      <option>Male (US)</option>
                      <option>Female (US)</option>
                      <option>Male (UK)</option>
                      <option>Female (UK)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Background Video
                    </label>
                    <select className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                      <option>Minecraft</option>
                      <option>Subway Surfers</option>
                      <option>Parkour</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Voice Speed
                    </label>
                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        min="0.5"
                        max="2"
                        step="0.1"
                        defaultValue="1"
                        className="flex-1"
                      />
                      <span className="text-sm text-gray-600 w-12">1.0x</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Background Music Volume
                    </label>
                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        defaultValue="30"
                        className="flex-1"
                      />
                      <span className="text-sm text-gray-600 w-12">30%</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Theme
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setIsDarkMode(!isDarkMode)}
                        className={`flex-1 px-4 py-2 rounded-lg border ${
                          !isDarkMode
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        Light
                      </button>
                      <button
                        onClick={() => setIsDarkMode(!isDarkMode)}
                        className={`flex-1 px-4 py-2 rounded-lg border ${
                          isDarkMode
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        Dark
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t">
                <button
                  onClick={() => setCurrentStep(2)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 mr-3"
                >
                  Back
                </button>
                <button
                  onClick={() => setCurrentStep(4)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
                >
                  Generate Video
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Generate */}
      {currentStep === 4 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold mb-4">Generated Content</h2>
          <div className="max-w-lg mx-auto">
            <div className="relative aspect-[9/16] bg-black rounded-lg overflow-hidden">
              <video
                ref={videoRef}
                src={videoUrl}
                className="hidden"
                autoPlay
                loop
                muted
                playsInline
              />
              <canvas
                ref={canvasRef}
                className="w-full h-full"
              />
            </div>
            <button
              onClick={handleDownload}
              className="mt-4 w-full bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700"
            >
              Download Video
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


