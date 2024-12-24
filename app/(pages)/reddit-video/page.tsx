"use client";

import { useState, useEffect, useRef } from "react";
import { ArrowRightIcon } from "@heroicons/react/24/outline";
import OpenAI from 'openai';
import html2canvas from 'html2canvas';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import RecordRTC from 'recordrtc';

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

// Añadir esta función helper antes del handleDownload
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
  return currentY; // Retornar la altura final del texto
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
  const [isRecording, setIsRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isRecordingFast, setIsRecordingFast] = useState(false);
  const [previewDuration, setPreviewDuration] = useState(0);
  const [previewCurrentTime, setPreviewCurrentTime] = useState(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

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
    if (videoRef.current) {
      if (isVideoPlaying) {
        videoRef.current.pause();
        setIsVideoPlaying(false);
      } else {
        // Si el video está al final (o cerca del final), reiniciarlo
        if (videoRef.current.currentTime >= previewDuration - 0.1) {
          videoRef.current.currentTime = 0;
          setCurrentMessageIndex(0);
        }
        videoRef.current.play();
        setIsVideoPlaying(true);
      }
    }
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
    if (currentStep === 4 && videoRef.current) {
      const video = videoRef.current;
      setVideoUrl('/minecraft-vertical.mp4');

      // Duración exacta: 3 segundos por mensaje
      const totalDuration = (selectedComments.length + 1) * 3;
      setPreviewDuration(totalDuration);

      const updatePreview = () => {
        // Si el video supera la duración total, lo detenemos
        if (video.currentTime >= totalDuration) {
          video.pause();
          setIsVideoPlaying(false);
          setCurrentMessageIndex(-1);
          return;
        }

        setPreviewCurrentTime(video.currentTime);

        // Actualizar mensaje cada 3 segundos
        const messageIndex = Math.floor(video.currentTime / 3);
        if (messageIndex <= selectedComments.length) {
          setCurrentMessageIndex(messageIndex);
        }
      };

      video.addEventListener('timeupdate', updatePreview);
      video.play();
      setIsVideoPlaying(true);

      return () => {
        video.removeEventListener('timeupdate', updatePreview);
        setCurrentMessageIndex(-1);
        setIsVideoPlaying(false);
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

    // Iniciar la animación
    video.play();
    drawFrame();

    return () => {
      video.pause();
    };
  }, [currentMessageIndex, isDarkMode, selectedComments, storyData, avatarIndices]);

  // Añadir esta función de descarga
  const handleDownload = async () => {
    if (!canvasRef.current || !videoRef.current || !storyData) return;

    try {
      setIsDownloading(true);
      setDownloadProgress(0);
      console.log('🎬 Starting video export...');

      // 1. Preparar el video para la grabación
      const canvas = canvasRef.current;
      const video = videoRef.current;
      const totalDuration = (selectedComments.length + 1) * 3000; // en ms

      // 2. Reiniciar el video al principio
      video.currentTime = 0;
      await video.play();
      setIsVideoPlaying(true);
      setCurrentMessageIndex(0);

      // 3. Configurar la grabación
      const stream = canvas.captureStream(60);
      const chunks: Blob[] = [];
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: 8000000
      });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
          const progress = (video.currentTime / (totalDuration / 1000)) * 90;
          setDownloadProgress(Math.min(90, progress));
        }
      };

      mediaRecorder.onstop = async () => {
        try {
          setDownloadProgress(95);
          console.log('📼 Recording completed, creating file...');

          // Crear el blob final
          const blob = new Blob(chunks, { type: 'video/webm' });

          // Descargar directamente el archivo webm
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `reddit-video-${Date.now()}.webm`;
          a.click();
          URL.revokeObjectURL(url);

          setDownloadProgress(100);
          console.log('✅ Download complete!');
        } catch (error) {
          console.error('Error in mediaRecorder.onstop:', error);
          throw error;
        }
      };

      // 4. Comenzar grabación
      mediaRecorder.start(1000);

      // 5. Esperar a que termine la duración total
      await new Promise<void>((resolve) => {
        const checkEnd = setInterval(() => {
          if (video.currentTime >= totalDuration / 1000) {
            clearInterval(checkEnd);
            mediaRecorder.stop();
            resolve();
          }
        }, 100);
      });

    } catch (error) {
      console.error('❌ Error during video export:', error);
      alert('Error generating video. Please try again.');
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
      setCurrentMessageIndex(-1);
      setIsVideoPlaying(false);
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }
    }
  };

  // Función auxiliar para dibujar cada mensaje
  const drawMessage = async (
    ctx: CanvasRenderingContext2D,
    messageIndex: number,
    storyData: RedditData,
    selectedComments: number[],
    isDarkMode: boolean
  ) => {
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    const cardWidth = width * 0.8;
    const cardX = (width - cardWidth) / 2;

    if (messageIndex === 0) {
      // Dibujar título
      const cardHeight = 300;
      const cardY = height * 0.3;

      // Card background
      ctx.fillStyle = isDarkMode ? '#1A1A1A' : '#FFFFFF';
      ctx.fillRect(cardX, cardY, cardWidth, cardHeight);

      // Texto del título
      ctx.fillStyle = isDarkMode ? '#FFFFFF' : '#000000';
      ctx.font = 'bold 40px Arial';
      wrapText(ctx, storyData.title, cardX + 20, cardY + 80, cardWidth - 40, 50);

      // Metadata
      ctx.fillStyle = isDarkMode ? '#9CA3AF' : '#6B7280';
      ctx.font = '24px Arial';
      ctx.fillText(storyData.author, cardX + 20, cardY + 40);

    } else {
      // Dibujar comentario
      const comment = storyData.commentsList[selectedComments[messageIndex - 1]];
      const cardHeight = 250;
      const cardY = height * 0.3;

      // Card background
      ctx.fillStyle = isDarkMode ? '#1A1A1A' : '#FFFFFF';
      ctx.fillRect(cardX, cardY, cardWidth, cardHeight);

      // Texto del comentario
      ctx.fillStyle = isDarkMode ? '#FFFFFF' : '#000000';
      ctx.font = '32px Arial';
      wrapText(ctx, comment.content, cardX + 20, cardY + 80, cardWidth - 40, 40);

      // Metadata
      ctx.fillStyle = isDarkMode ? '#9CA3AF' : '#6B7280';
      ctx.font = '24px Arial';
      ctx.fillText(comment.author, cardX + 20, cardY + 40);
    }
  };

  // Añadir este useEffect para manejar la visibilidad y cierre de página
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && isRecording) {
        console.log('⚠️ Page hidden while recording, pausing...');
        if (recorderRef.current?.state === 'recording') {
          recorderRef.current.pause();
        }
        if (videoRef.current) videoRef.current.pause();
        if (intervalRef.current) clearInterval(intervalRef.current);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      } else if (!document.hidden && isRecording) {
        console.log('✅ Page visible again, resuming...');
        if (recorderRef.current?.state === 'paused') {
          recorderRef.current.resume();
        }
        if (videoRef.current) videoRef.current.play();
      }
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isRecording) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isRecording]);

  // Añadir cleanup cuando el componente se desmonta
  useEffect(() => {
    return () => {
      if (recorderRef.current?.state === 'recording') {
        recorderRef.current.stop();
      }
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  useEffect(() => {
    // Cargar FFmpeg al inicio
    const loadFFmpeg = async () => {
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
      const ffmpeg = new FFmpeg();
      try {
        // Cargar los archivos necesarios de FFmpeg
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        console.log('✅ FFmpeg loaded successfully');
      } catch (error) {
        console.error('❌ Error loading FFmpeg:', error);
      }
    };

    loadFFmpeg();
  }, []);

  // Añadir función para manejar el seek
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (videoRef.current) {
      const time = parseFloat(e.target.value);
      videoRef.current.currentTime = time;
      setPreviewCurrentTime(time);

      // Si el video está en el final y el usuario busca una nueva posición,
      // debemos actualizar el estado de reproducción
      if (!isVideoPlaying && time < videoRef.current.duration) {
        videoRef.current.play();
        setIsVideoPlaying(true);
      }
    }
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
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    className="absolute inset-0 w-full h-full object-cover"
                    autoPlay
                    muted
                    playsInline
                    onEnded={() => {
                      console.log('Video ended'); // Para debugging
                      setIsVideoPlaying(false);
                      setCurrentMessageIndex(-1);
                    }}
                  />
                  <canvas
                    ref={canvasRef}
                    className="absolute inset-0 w-full h-full"
                    width={1080}
                    height={1920}
                    style={{
                      zIndex: 1,
                      imageRendering: 'pixelated'
                    }}
                  />
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
                className="absolute inset-0 w-full h-full object-cover"
                autoPlay
                muted
                playsInline
                onEnded={() => {
                  console.log('Video ended'); // Para debugging
                  setIsVideoPlaying(false);
                  setCurrentMessageIndex(-1);
                }}
              />
              <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full"
                width={1080}
                height={1920}
              />
              {/* Controles */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 p-4">
                <div className="flex items-center gap-4">
                  {/* Botón Play/Pause */}
                  <button
                    onClick={handlePlayPause}
                    className="text-white hover:text-gray-200"
                  >
                    {isVideoPlaying ? (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                      </svg>
                    )}
                  </button>

                  {/* Tiempo actual */}
                  <span className="text-white text-sm">
                    {Math.floor(previewCurrentTime)}s
                  </span>

                  {/* Seekbar */}
                  <input
                    type="range"
                    min="0"
                    max={previewDuration}
                    value={previewCurrentTime}
                    onChange={handleSeek}
                    className="flex-1 h-2 bg-white/20 rounded-lg appearance-none cursor-pointer"
                  />

                  {/* Duración total */}
                  <span className="text-white text-sm">
                    {previewDuration}s
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={handleDownload}
              disabled={isDownloading}
              className="mt-4 w-full bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isDownloading ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {downloadProgress < 100 ? `Processing ${Math.round(downloadProgress)}%` : 'Downloading...'}
                </>
              ) : (
                'Download Video'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


