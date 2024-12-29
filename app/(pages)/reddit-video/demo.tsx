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
  const [redditUrl, setRedditUrl] = useState("https://www.reddit.com/r/Money/comments/1hjrq5o/is_there_an_end_to_the_want");
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
  const [isPrerendering, setIsPrerendering] = useState(false);
  const [prerenderProgress, setPrerenderProgress] = useState(0);


  // Añadir una referencia al video y al canvas
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Añadir nuevo estado para el video pre-renderizado
  const [prerenderedVideo, setPrerenderedVideo] = useState<Blob | null>(null);

  // Añadir nuevo estado para los stats aleatorios
  const [messageStats, setMessageStats] = useState<{likes: number, comments: number}[]>([]);

  // Añadir nuevo estado para controlar si está pausado
  const [isPaused, setIsPaused] = useState(false);

  // Añadir nuevo estado para controlar la reanudación
  const [needsResume, setNeedsResume] = useState(false);

  // Añadir nuevas refs para el video y recorder ocultos
  const hiddenVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  // Añadir estado para controlar si está listo para grabar
  const [isReadyToRecord, setIsReadyToRecord] = useState(false);

  // Añadir una ref para la duración total
  const totalDurationRef = useRef<number>(0);

  // Añadir estas referencias y estados
  const framesRef = useRef<HTMLImageElement[]>([]);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isLoadingFrames, setIsLoadingFrames] = useState(false);

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
    setSelectedComments(prev => {
      if (prev.includes(index)) {
        // Si ya está seleccionado, lo removemos y reordenamos los demás
        const newSelected = prev.filter(i => i !== index);
        return newSelected;
      } else {
        // Si no está seleccionado, lo añadimos al final
        return [...prev, index];
      }
    });
  };

  const handlePlayPause = () => {
    setIsVideoPlaying(!isVideoPlaying);
    if (!isVideoPlaying && currentFrameIndex >= framesRef.current.length - 1) {
      setCurrentFrameIndex(0); // Reiniciar si estamos al final
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
    console.log('🎬 Starting high quality video generation...');
    setIsGenerating(true);
    setProgress(0);

    try {
      // 1. Crear un canvas de alta resolución
      const canvas = new OffscreenCanvas(1920, 3840); // 4K vertical
      const ctx = canvas.getContext('2d', {
        alpha: false,
        willReadFrequently: true
      });
      if (!ctx) throw new Error('Failed to get canvas context');

      // 2. Pre-cargar el video de fondo
      const backgroundVideo = document.createElement('video');
      backgroundVideo.src = '/minecraft-vertical.mp4';
      backgroundVideo.muted = true;
      await new Promise<void>((resolve) => {
        backgroundVideo.onloadeddata = () => resolve();
        backgroundVideo.load();
      });

      // 3. Inicializar FFmpeg
      const ffmpeg = new FFmpeg();
      await ffmpeg.load();
      console.log('✅ FFmpeg loaded');

      // 4. Calcular frames totales (30fps * duración)
      const fps = 20;
      const duration = (selectedComments.length + 1) * 3; // 3 segundos por mensaje
      const totalFrames = fps * duration;

      // 5. Generar y guardar cada frame
      for (let frame = 0; frame < totalFrames; frame++) {
        // Calcular tiempo actual y mensaje correspondiente
        const currentTime = frame / fps;
        const messageIndex = Math.floor(currentTime / 3);

        // Posicionar el video en el tiempo correcto
        backgroundVideo.currentTime = currentTime % backgroundVideo.duration;
        await new Promise(r => setTimeout(r, 10)); // Esperar a que el video se actualice

        // Dibujar frame
        ctx.drawImage(backgroundVideo, 0, 0, canvas.width, canvas.height);

        if (messageIndex <= selectedComments.length) {
          drawMessage(ctx, messageIndex, isDarkMode, storyData, selectedComments);
        }

        // Convertir canvas a PNG de alta calidad
        const blob = await canvas.convertToBlob({
          type: 'image/png',
          quality: 1
        });

        // Guardar frame
        const frameData = await blob.arrayBuffer();
        await ffmpeg.writeFile(`frame${frame.toString().padStart(6, '0')}.png`, new Uint8Array(frameData));

        // Actualizar progreso
        const progress = (frame / totalFrames) * 100;
        setProgress(progress);
        console.log(`📊 Rendering progress: ${progress.toFixed(1)}%`);
      }

      // 6. Generar video de alta calidad con FFmpeg
      console.log('🎥 Generating final video...');
      await ffmpeg.exec([
        '-framerate', '30',
        '-i', 'frame%06d.png',
        '-c:v', 'libx264',
        '-preset', 'veryslow', // Máxima calidad
        '-crf', '17', // Calidad casi sin pérdida (0-51, menor es mejor)
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        'output.mp4'
      ]);

      // 7. Leer el video final
      const outputData = await ffmpeg.readFile('output.mp4');
      const videoBlob = new Blob([outputData], { type: 'video/mp4' });
      setPrerenderedVideo(videoBlob);

      console.log('✅ High quality video generated successfully!');
      console.log(`📊 Final video size: ${(videoBlob.size / (1024 * 1024)).toFixed(2)}MB`);

    } catch (error) {
      console.error('❌ Error generating video:', error);
      alert('Failed to generate video. Please try again.');
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
    if ((currentStep === 3 || currentStep === 4) && videoRef.current) {
      const video = videoRef.current;

      // Si estamos en el paso 3, usamos el video de minecraft
      if (currentStep === 3) {
        setVideoUrl('/minecraft-vertical.mp4');
      }

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

    // Generar stats aleatorios para cada mensaje
    const stats = Array.from({ length: selectedComments.length + 1 }, () => ({
      likes: Math.floor(Math.random() * 10000) + 100,
      comments: Math.floor(Math.random() * 1000) + 10
    }));
    setMessageStats(stats);
  }, [selectedComments.length]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const video = videoRef.current;

    if (!ctx || !video || !storyData) return;

    // Configurar dimensiones del canvas
    canvas.width = 1080;
    canvas.height = 1920;

    const drawFrame = () => {
      // Dibujar el video
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Dibujar el overlay semitransparente
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Dibujar el contenido actual si hay un mensaje seleccionado
      if (currentMessageIndex >= 0 && storyData) {
        // Configurar estilos base
        const cardWidth = canvas.width * 0.8;
        const cardX = (canvas.width - cardWidth) / 2;
        let cardHeight = 200; // Altura base

        // Ajustar altura según el contenido
        const content = currentMessageIndex === 0
          ? storyData.title
          : storyData.commentsList[selectedComments[currentMessageIndex - 1]].content;
        const lines = Math.ceil(content.length / 44);
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
        const userImage = new Image();
        userImage.src = `/redditimages/${avatarIndices[currentMessageIndex] + 1}.jpg`;
        ctx.save();
        ctx.beginPath();
        ctx.arc(cardX + 45, cardY + 45, 25, 0, Math.PI * 2);
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
        } else {
          // Dibujar comentario
          const comment = storyData.commentsList[selectedComments[currentMessageIndex - 1]];

          ctx.fillStyle = isDarkMode ? '#FFFFFF' : '#000000';
          ctx.font = 'bold 36px Arial';
          ctx.fillText(`u/${comment.author}`, cardX + 80, cardY + 50);

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
        ctx.fillText(`❤️ ${messageStats[currentMessageIndex].likes.toLocaleString()}`, cardX + 20, cardY + cardHeight - 40);
        ctx.fillText(`💬 ${messageStats[currentMessageIndex].comments.toLocaleString()}`, cardX + 150, cardY + cardHeight - 40);
      }

      requestAnimationFrame(drawFrame);
    };

    // Iniciar la animación
    video.play();
    drawFrame();

    return () => {
      video.pause();
    };
  }, [currentMessageIndex, isDarkMode, selectedComments, storyData, avatarIndices, messageStats, currentStep]);



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
      if (document.hidden) {
        setIsPaused(true);
        setNeedsResume(true);
        if (hiddenVideoRef.current) {
          hiddenVideoRef.current.pause();
        }
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.pause();
        }
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

  // Modificar la función cuando se pasa del paso 3 al 4
  const handleGenerateVideo = async () => {
    if (!isReadyToRecord) return;
    console.log('🎥 Starting new video generation...');
    console.log('📊 Initial chunks: []');

    // Crear una referencia al contenedor que usaremos después
    let currentContainer: HTMLElement | null = null;

    try {
      // Limpiar cualquier estado previo
      if (mediaRecorderRef.current?.state === 'recording') {
        console.log('⏹️ Stopping previous recording...');
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current = null;

      // Limpiar cualquier contenedor anterior que pueda existir
      const oldContainer = document.querySelector('[id^="hidden-recorder-container"]');
      if (oldContainer) {
        oldContainer.remove();
      }

      setIsPrerendering(true);
      setPrerenderProgress(0);
      setIsPaused(false);
      setIsReadyToRecord(false);
      startTimeRef.current = Date.now();
      totalDurationRef.current = (selectedComments.length + 1) * 3000;

      // Crear un nuevo contenedor con ID único
      const containerId = `hidden-recorder-container-${Date.now()}`;
      currentContainer = document.createElement('div');
      currentContainer.id = containerId;
      currentContainer.style.position = 'absolute';
      currentContainer.style.left = '-9999px';
      currentContainer.style.top = '-9999px';
      document.body.appendChild(currentContainer);

      // Crear elementos de video y canvas ocultos
      const hiddenVideo = document.createElement('video');
      hiddenVideo.src = '/minecraft-vertical.mp4';
      hiddenVideo.muted = true;
      hiddenVideo.crossOrigin = 'anonymous'; // Añadir esto para evitar problemas de CORS
      hiddenVideoRef.current = hiddenVideo;

      const hiddenCanvas = document.createElement('canvas');
      hiddenCanvas.width = 1080;
      hiddenCanvas.height = 1920;
      const ctx = hiddenCanvas.getContext('2d');

      currentContainer.appendChild(hiddenVideo);
      currentContainer.appendChild(hiddenCanvas);

      // Configurar la grabación con un nuevo array de chunks
      const stream = hiddenCanvas.captureStream(60);
      const chunks: Blob[] = [];
      console.log('🔄 Reset chunks array to: []');

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: 8000000,
      });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
          console.log(`📝 New chunk added. Total chunks: ${chunks.length}`);
          console.log(`📦 Current total size: ${(chunks.reduce((acc, chunk) => acc + chunk.size, 0) / (1024 * 1024)).toFixed(2)}MB`);
        }
      };

      // Esperar a que el video se cargue
      await new Promise<void>((resolve, reject) => {
        hiddenVideo.onloadeddata = () => resolve();
        hiddenVideo.onerror = () => reject(new Error('Failed to load video'));
        hiddenVideo.load();
      });

      // Iniciar grabación
      mediaRecorder.start(1000);
      console.log('▶️ Recording started');
      await hiddenVideo.play();

      // Renderizar frames
      const renderFrame = () => {
        if (!ctx || !storyData || messageStats.length === 0) return;
        if (isPaused && !needsResume) return;

        // Dibujar el frame actual
        ctx.drawImage(hiddenVideo, 0, 0, hiddenCanvas.width, hiddenCanvas.height);

        // Calcular el tiempo actual y el progreso
        const currentTime = Date.now() - startTimeRef.current;
        const progress = (currentTime / totalDurationRef.current) * 100;

        // Si hemos superado la duración total, detener la grabación
        if (currentTime >= totalDurationRef.current) {
          mediaRecorder.stop();
          return;
        }

        // Calcular el índice del mensaje actual
        const messageIndex = Math.floor(currentTime / 3000);

        // Dibujar el mensaje actual
        if (messageIndex <= selectedComments.length) {
          // Configurar estilos base
          const cardWidth = hiddenCanvas.width * 0.8;
          const cardX = (hiddenCanvas.width - cardWidth) / 2;
          let cardHeight = 200; // Altura base

          // Ajustar altura según el contenido
          const content = messageIndex === 0
            ? storyData.title
            : storyData.commentsList[selectedComments[messageIndex - 1]].content;
          const lines = Math.ceil(content.length / 44);
          cardHeight += messageIndex === 0 ? lines * 80 : lines * 47;

          const cardY = (hiddenCanvas.height - cardHeight) / 2.3;

          // Dibujar card background
          ctx.fillStyle = isDarkMode ? '#1A1A1A' : '#FFFFFF';
          ctx.strokeStyle = isDarkMode ? '#374151' : '#D1D5DB';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(cardX, cardY, cardWidth, cardHeight, 12);
          ctx.fill();
          ctx.stroke();

          // Dibujar avatar
          const avatarImg = new Image();
          avatarImg.src = `/redditimages/${avatarIndices[messageIndex] + 1}.jpg`;
          ctx.save();
          ctx.beginPath();
          ctx.arc(cardX + 45, cardY + 45, 25, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(avatarImg, cardX + 20, cardY + 20, 50, 50);
          ctx.restore();

          if (messageIndex === 0) {
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
          } else {
            // Dibujar comentario
            const comment = storyData.commentsList[selectedComments[messageIndex - 1]];

            ctx.fillStyle = isDarkMode ? '#FFFFFF' : '#000000';
            ctx.font = 'bold 36px Arial';
            ctx.fillText(`u/${comment.author}`, cardX + 80, cardY + 50);

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
          ctx.fillText(`❤️ ${messageStats[messageIndex].likes.toLocaleString()}`, cardX + 20, cardY + cardHeight - 40);
          ctx.fillText(`💬 ${messageStats[messageIndex].comments.toLocaleString()}`, cardX + 150, cardY + cardHeight - 40);
        }

        // Actualizar el progreso solo si no está pausado
        if (!isPaused) {
          setPrerenderProgress(Math.min(progress, 99));
        }

        // Continuar renderizando si no hemos alcanzado la duración total
        requestAnimationFrame(renderFrame);
      };

      // Modificar la promesa de finalización
      await new Promise<void>((resolve) => {
        mediaRecorder.onstop = async () => {
          try {
            console.log(`🔍 Checking final chunks. Count: ${chunks.length}`);
            if (chunks.length > 0 && !isPaused) {
              console.log(`📦 Creating final video from ${chunks.length} chunks`);
              const totalSize = chunks.reduce((acc, chunk) => acc + chunk.size, 0);
              console.log(`📊 Total chunks size before merge: ${(totalSize / (1024 * 1024)).toFixed(2)}MB`);

              const finalBlob = new Blob(chunks, { type: 'video/webm' });
              setPrerenderedVideo(finalBlob);
              console.log(`💾 Final video size: ${(finalBlob.size / (1024 * 1024)).toFixed(2)}MB`);
            } else {
              console.log(`⚠️ No video created. Chunks: ${chunks.length}, isPaused: ${isPaused}`);
            }
            resolve();
          } catch (error) {
            console.error('❌ Error creating final video:', error);
            resolve();
          }
        };
        renderFrame();
      });

      setPrerenderProgress(100);
      setCurrentStep(4);

    } catch (error) {
      console.error('❌ Error pre-rendering video:', error);
      console.log('💥 Recording failed, chunks will be discarded');
      alert('Error generating video. Please try again.');
    } finally {
      // Limpiar todo en el finally
      try {
        if (currentContainer && document.body.contains(currentContainer)) {
          currentContainer.remove();
        }
        if (!isPaused) {
          if (hiddenVideoRef.current) {
            hiddenVideoRef.current.pause();
            hiddenVideoRef.current = null;
          }
          mediaRecorderRef.current = null;
          setIsPrerendering(false);
          setIsPaused(false);
        }
      } catch (cleanupError) {
        console.error('Error during cleanup:', cleanupError);
      }
    }
  };

  // Modificar la función handleDownload
  const handleDownload = async () => {
    if (!prerenderedVideo) return;

    try {
      setIsDownloading(true);

      // Crear URL y descargar
      const url = URL.createObjectURL(prerenderedVideo);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reddit-video-${Date.now()}.webm`;
      a.click();
      URL.revokeObjectURL(url);

    } catch (error) {
      console.error('Error downloading video:', error);
      alert('Error downloading video. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  // Modify the handleDownloadMixed function
  const handleDownloadMixed = async () => {
    if (!prerenderedVideo || !storyData) return;

    try {
      setIsDownloading(true);
      setDownloadProgress(0);

      // 1. Generate TTS for title and all selected comments
      console.log('🎙️ Generating TTS audio for all content...');
      const audioSegments: Blob[] = [];

      // Generate title audio
      const titleAudio = await generateSpeech(storyData.title);
      if (titleAudio) {
        const response = await fetch(titleAudio);
        const blob = await response.blob();
        audioSegments.push(blob);
      }

      // Generate audio for each selected comment
      for (const commentIndex of selectedComments) {
        const comment = storyData.commentsList[commentIndex];
        const commentAudio = await generateSpeech(comment.content);
        if (commentAudio) {
          const response = await fetch(commentAudio);
          const blob = await response.blob();
          audioSegments.push(blob);
        }
        setDownloadProgress((audioSegments.length / (selectedComments.length + 1)) * 30);
      }

      console.log(`✅ Generated ${audioSegments.length} audio segments`);
      setDownloadProgress(40);

      // 2. Load FFmpeg
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
      const ffmpeg = new FFmpeg();
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      console.log('✅ FFmpeg loaded');
      setDownloadProgress(50);

      // 3. Write all audio files to FFmpeg
      for (let i = 0; i < audioSegments.length; i++) {
        await ffmpeg.writeFile(`audio${i}.mp3`, new Uint8Array(await audioSegments[i].arrayBuffer()));
      }

      // 4. Create a concatenation file
      const concatContent = audioSegments
        .map((_, i) => `file 'audio${i}.mp3'`)
        .join('\n');
      await ffmpeg.writeFile('concat.txt', concatContent);

      // 5. Concatenate all audio files
      await ffmpeg.exec([
        '-f', 'concat',
        '-safe', '0',
        '-i', 'concat.txt',
        '-c', 'copy',
        'combined_audio.mp3'
      ]);
      console.log('✅ Audio files concatenated');
      setDownloadProgress(70);

      // 6. Write the video file
      const videoData = await prerenderedVideo.arrayBuffer();
      await ffmpeg.writeFile('video.webm', new Uint8Array(videoData));
      setDownloadProgress(80);

      // 7. Mix video with concatenated audio
      await ffmpeg.exec([
        '-i', 'video.webm',
        '-i', 'combined_audio.mp3',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-strict', 'experimental',
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-shortest',
        'output.mp4'
      ]);
      console.log('✅ Video and audio mixed');
      setDownloadProgress(90);

      // 8. Read and download the final file
      const data = await ffmpeg.readFile('output.mp4');
      const finalBlob = new Blob([data], { type: 'video/mp4' });

      // Create download link
      const url = URL.createObjectURL(finalBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reddit-video-with-tts-${Date.now()}.mp4`;
      a.click();
      URL.revokeObjectURL(url);

      console.log('✅ Download started');
      setDownloadProgress(100);

    } catch (error) {
      console.error('❌ Error creating video with TTS:', error);
      alert('Error creating video with TTS. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  // Modificar el botón en el paso 3 para usar la nueva función
  const renderStep3Button = () => (
    <button
      id='generate-video-button'
      onClick={handleGenerateVideo}
      className={`bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all ${
        isReadyToRecord ? 'hover:bg-blue-700' : 'opacity-50 cursor-not-allowed'
      }`}
      disabled={!isReadyToRecord || isPrerendering}
    >
      {isReadyToRecord ? 'Generate Video' : 'Loading...'}
    </button>
  );

  // Añadir pantalla de pre-renderizado
  const renderPreRenderingScreen = () => (
    isPrerendering && (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
        <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4">
          <h3 className="text-xl font-semibold mb-4">Creating Your Video</h3>

          {isPaused ? (
            <div className="mb-6 text-center">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                <p className="text-yellow-800 font-medium mb-2">
                  ⚠️ Recording Paused
                </p>
                <p className="text-sm text-yellow-700">
                  You left the tab while recording. The recording will restart from the beginning to ensure the best quality.
                </p>
              </div>
              <button
                onClick={handleResume}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                Restart Recording
              </button>
            </div>
          ) : (
            <>
              <div className="mb-4">
                <div className="h-2 bg-gray-200 rounded-full">
                  <div
                    className="h-full bg-blue-600 rounded-full transition-all duration-300"
                    style={{ width: `${prerenderProgress}%` }}
                  />
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  {prerenderProgress === 0 ? 'Initializing...' : `${prerenderProgress}% complete`}
                </p>
                {prerenderProgress === 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    Will auto-restart if stuck...
                  </p>
                )}
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  Please keep this tab open and active. Switching tabs will pause the recording and may affect video quality.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    )
  );

  // Añadir función para reanudar la grabación
  const handleResume = async () => {
    try {
      console.log('🔄 Starting recording resume process...');

      // Detener cualquier grabación actual y limpiar referencias
      if (mediaRecorderRef.current) {
        if (mediaRecorderRef.current.state === 'recording' || mediaRecorderRef.current.state === 'paused') {
          mediaRecorderRef.current.stop();
        }
        mediaRecorderRef.current = null;
      }

      // Limpiar el video oculto
      if (hiddenVideoRef.current) {
        hiddenVideoRef.current.pause();
        hiddenVideoRef.current.remove();
        hiddenVideoRef.current = null;
      }

      // Limpiar el contenedor oculto
      const existingContainer = document.querySelector('[id^="hidden-recorder-container"]');
      if (existingContainer) {
        existingContainer.remove();
      }

      // Reiniciar todos los estados
      setIsPrerendering(true);
      setPrerenderProgress(0);
      setPrerenderedVideo(null);
      setIsPaused(false);
      setNeedsResume(false);
      startTimeRef.current = Date.now();

      // Esperar a que todo se limpie
      await new Promise(resolve => setTimeout(resolve, 200));

      // Volver al paso 3 y reiniciar el proceso
      setCurrentStep(3);
      setIsReadyToRecord(true);

      // Añadir el timeout para hacer clic automático en el botón
      setTimeout(() => {
        const generateButton = document.getElementById('generate-video-button');
        if (generateButton) {
          generateButton.click();
        }
      }, 100);

      console.log('🎬 Ready to start new recording from scratch');

    } catch (error) {
      console.error('❌ Error resuming recording:', error);
      alert('Error resuming recording. Please try again.');
      setIsPrerendering(false);
      setCurrentStep(3);
    }
  };

  // Añadir useEffect para verificar cuando está listo para grabar
  useEffect(() => {
    const checkIfReady = async () => {
      try {
        // Verificar que tenemos todo lo necesario
        if (
          selectedComments.length > 0 &&
          storyData &&
          messageStats.length > 0 &&
          avatarIndices.length > 0
        ) {
          // Intentar cargar el video de fondo
          const video = document.createElement('video');
          video.src = '/minecraft-vertical.mp4';
          await new Promise((resolve, reject) => {
            video.onloadeddata = resolve;
            video.onerror = reject;
            video.load();
          });

          setIsReadyToRecord(true);
        }
      } catch (error) {
        console.error('Error checking if ready:', error);
        setIsReadyToRecord(false);
      }
    };

    checkIfReady();
  }, [selectedComments.length, storyData, messageStats.length, avatarIndices.length]);

  // Modificar el useEffect que maneja la reproducción automática
  useEffect(() => {
    if (currentStep === 3) {
      // Mostrar el primer mensaje y activar reproducción automática
      setCurrentMessageIndex(0);
      setIsPlaying(true);

      const video = videoRef.current;
      if (video) {
        video.currentTime = 0;
        video.play();
      }
    }
  }, [currentStep]);

  // Modificar el useEffect que maneja el video y canvas para el paso 3
  useEffect(() => {
    if (currentStep === 3) {
      const video = videoRef.current;
      if (video) {
        video.currentTime = 0; // Reiniciar el video al inicio
        video.play();
      }
    }
  }, [currentStep]);

  // Añadir un nuevo useEffect para detectar el estancamiento
  useEffect(() => {
    let stuckTimer: NodeJS.Timeout | null = null;

    if (isPrerendering && prerenderProgress === 0) {
      // Iniciar temporizador cuando el progreso está en 0
      stuckTimer = setTimeout(() => {
        console.log('🔄 Progress stuck at 0%, auto-restarting...');
        handleResume(); // Llamar a la misma función que el botón de restart
      }, 2000); // 2 segundos
    }

    // Limpiar el timer si el progreso cambia o se detiene el pre-rendering
    return () => {
      if (stuckTimer) {
        clearTimeout(stuckTimer);
      }
    };
  }, [isPrerendering, prerenderProgress]);

  // Añadir esta función para cargar los frames
  const loadFrames = async () => {
    setIsLoadingFrames(true);
    const frames: HTMLImageElement[] = [];

    try {
      // Cargar los 150 frames (o el número que tengas)
      for (let i = 1; i <= 150; i++) {
        const img = new Image();
        img.src = `/frames/ezgif-frame-${i.toString().padStart(3, '0')}.jpg`;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });
        frames.push(img);
      }

      console.log(`✅ Loaded ${frames.length} frames successfully`);
      framesRef.current = frames;
      setIsLoadingFrames(false);
    } catch (error) {
      console.error('❌ Error loading frames:', error);
      setIsLoadingFrames(false);
    }
  };

  // Modificar el useEffect que maneja el canvas y los frames
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');

    if (!ctx || !storyData || !framesRef.current.length) return;

    let animationFrameId: number;
    let lastFrameTime = 0;
    const fps = 20; // Ajustar a 20 FPS
    const frameInterval = 1000 / fps;

    const drawFrame = (timestamp: number) => {
      if (timestamp - lastFrameTime >= frameInterval) {
        // Limpiar el canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Dibujar el frame actual
        const currentFrame = framesRef.current[currentFrameIndex];
        ctx.drawImage(currentFrame, 0, 0, canvas.width, canvas.height);

        // Dibujar el overlay y el contenido actual
        if (currentMessageIndex >= 0) {
          // Aquí va el código existente para dibujar el contenido
          // ...
        }

        // Actualizar el último tiempo de frame
        lastFrameTime = timestamp;

        // Avanzar al siguiente frame si está reproduciendo
        if (isVideoPlaying) {
          setCurrentFrameIndex(prev =>
            prev + 1 >= framesRef.current.length ? 0 : prev + 1
          );
        }
      }

      animationFrameId = requestAnimationFrame(drawFrame);
    };

    animationFrameId = requestAnimationFrame(drawFrame);

    // Cleanup
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [currentFrameIndex, currentMessageIndex, storyData, isVideoPlaying]);

  // Añadir useEffect para cargar los frames cuando se entra al paso 3
  useEffect(() => {
    if (currentStep === 3) {
      loadFrames();
    }
  }, [currentStep]);

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Añadir la pantalla de pre-renderizado */}
      {renderPreRenderingScreen()}

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
                      <div className="flex items-center gap-2">
                        {selectedComments.includes(index) && (
                          <span className="text-sm font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded">
                            #{selectedComments.indexOf(index) + 1}
                          </span>
                        )}
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
                    </div>
                    <p className="text-gray-700 text-sm">{comment.content}</p>
                  </div>
                ))}
              </div>
              <div className="sticky bottom-4 bg-white p-4 border-t mt-6">
                <button
                  onClick={() => setCurrentStep(3)}
                  className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
                  disabled={selectedComments.length === 0}
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
                  {isLoadingFrames ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span>Loading frames...</span>
                    </div>
                  ) : (
                    <canvas
                      ref={canvasRef}
                      className="absolute inset-0 w-full h-full"
                      width={1080}
                      height={1920}
                    />
                  )}

                  {/* Añadir controles de video */}
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
                        {`${previewDuration}s`}
                      </span>
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
                {renderStep3Button()}
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

            {/* Añadir reproductor de audio */}
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Preview Audio</h3>
              <audio
                controls
                className="w-full"
                src="/demo.mp3"
              >
                Your browser does not support the audio element.
              </audio>

              {/* Añadir botón para descargar video con audio */}
              <button
                onClick={handleDownloadMixed}
                disabled={isDownloading}
                className="mt-4 w-full bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isDownloading ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Processing...
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                    </svg>
                    Download Video + Audio
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
