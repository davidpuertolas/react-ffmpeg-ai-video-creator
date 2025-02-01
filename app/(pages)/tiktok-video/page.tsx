"use client";

import { useState, useEffect, useRef } from "react";
import { ArrowRightIcon } from "@heroicons/react/24/outline";
import OpenAI from 'openai';
import html2canvas from 'html2canvas';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import RecordRTC from 'recordrtc';

const steps = [
  { id: 1, name: "Script" },
  { id: 2, name: "Style" },
  { id: 3, name: "Preview" },
  { id: 4, name: "Generate" },
];

interface ScriptData {
  title: string;
  content: string[];
  style: string;
  tone: string;
  duration: number;
}

interface ScriptSegment {
  text: string;
  image: string;
  audio: string;
  duration: number;
  startTime: number;
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

// Añadir función para generar el guión
const generateScript = async (topic: string, style: string, duration: number) => {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a professional video script writer. Create a script for a ${duration}-second video about ${topic}.
          The style should be ${style}. Break down the script into 5-10 second segments.
          Format the response as JSON (only 2 segments or you are fired, its a demo) with an array of segments, each containing text that can be read in the specified time.`
        },
        {
          role: "user",
          content: `Write a script about: ${topic}`
        }
      ],
      response_format: { type: "json_object" }
    });

    const scriptData = JSON.parse(response.choices[0].message.content);
    return scriptData.segments;
  } catch (error) {
    console.error('Error generating script:', error);
    throw error;
  }
};

// Modificar la función para buscar imágenes en Pexels
const searchPexelsImage = async (query: string) => {
  try {
    console.log('🔍 Searching image for text:', query.substring(0, 50) + '...');

    const response = await fetch(`/api/pexels?query=${encodeURIComponent(query)}`);

    if (!response.ok) {
      console.error('❌ Pexels API error:', response.status, response.statusText);
      throw new Error('Failed to fetch from Pexels API');
    }

    const data = await response.json();
    console.log('✅ Pexels response:', {
      totalResults: data.total_results,
      firstImageUrl: data.photos[0]?.src?.landscape || 'No image found'
    });

    return data.photos[0]?.src?.landscape || '/default-background.jpg';
  } catch (error) {
    console.error('❌ Error fetching image:', error);
    return '/default-background.jpg';
  }
};

export default function RedditVideoPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [scriptData, setScriptData] = useState<ScriptData | null>(null);
  const [scriptSegments, setScriptSegments] = useState<ScriptSegment[]>([]);
  const [selectedStyle, setSelectedStyle] = useState('casual');
  const [selectedTone, setSelectedTone] = useState('friendly');
  const [targetDuration, setTargetDuration] = useState(60); // duración en segundos
  const [isLoading, setIsLoading] = useState(false);
  const [urlError, setUrlError] = useState('');
  const [selectedComments, setSelectedComments] = useState<number[]>([]);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [loadedImages, setLoadedImages] = useState<string[]>([]);
  const [audioFiles, setAudioFiles] = useState<{
    [key: string]: {
      audio: string;
      text: string;
      duration: number;
    }
  }>({});
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

  // Añadir estado para el topic
  const [topic, setTopic] = useState('');

  // Add videoRef declaration at the top with other refs
  const videoRef = useRef<HTMLVideoElement>(null);

  const isValidRedditUrl = (url: string) => {
    const redditPattern = /^https?:\/\/(www\.)?reddit\.com\/r\/[\w-]+\/comments\/[\w-]+\/.*/;
    return redditPattern.test(url);
  };

  // Modificar handleScriptGeneration para añadir más logs
  const handleScriptGeneration = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);

    try {
      console.log('🎬 Starting script generation for topic:', topic);
      console.log('📝 Parameters:', {
        style: selectedStyle,
        duration: targetDuration,
        tone: selectedTone
      });

      // Generar el guión
      const segments = await generateScript(topic, selectedStyle, targetDuration);
      console.log('✅ Script generated:', segments);

      // Crear el objeto scriptData
      const newScriptData: ScriptData = {
        title: topic,
        content: segments.map(s => s.text),
        style: selectedStyle,
        tone: selectedTone,
        duration: targetDuration
      };

      // Inicializar los segmentos
      const newSegments: ScriptSegment[] = [];
      let currentStartTime = 0;

      console.log('🎨 Processing segments and fetching images...');

      // Procesar cada segmento
      for (const segment of segments) {
        console.log('📍 Processing segment:', segment.text.substring(0, 50) + '...');

        // Buscar imagen relacionada en Pexels
        const image = await searchPexelsImage(segment.text);
        console.log('🖼️ Image found:', image);

        // Generar audio con TTS
        const audio = await generateSpeech(segment.text);
        console.log('🎙️ Audio generated:', audio ? 'Success' : 'Failed');

        // Calcular duración aproximada
        const duration = segment.text.length / 15;
        console.log('⏱️ Segment duration:', duration.toFixed(2) + 's');

        newSegments.push({
          text: segment.text,
          image: image || '/default-background.jpg',
          audio: audio || '',
          duration,
          startTime: currentStartTime
        });

        currentStartTime += duration;
      }

      console.log('✅ All segments processed:', newSegments);

      setScriptData(newScriptData);
      setScriptSegments(newSegments);
      setCurrentStep(2);

    } catch (error) {
      console.error('❌ Error in script generation:', error);
      alert('Error generating script. Please try again.');
    } finally {
      setIsGenerating(false);
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
    if (!isVideoPlaying) {
      // Si estamos reanudando, actualizar el tiempo de inicio
      startTimeRef.current = Date.now() - (previewCurrentTime * 1000);
    }
  };

  useEffect(() => {
    let timer;

    if (isPlaying) {
      const currentAudio = audioFiles[`comment_${currentMessageIndex}`];
      const duration = currentAudio?.duration * 1000 || 3000; // Duración real o valor predeterminado

      timer = setTimeout(() => {
        const maxIndex = selectedComments.length;
        if (currentMessageIndex < maxIndex) {
          setCurrentMessageIndex((prev) => prev + 1);
        } else {
          setIsPlaying(false);
          setCurrentMessageIndex(-1);
        }
      }, duration);
    }

    return () => clearTimeout(timer);
  }, [currentMessageIndex, isPlaying, audioFiles]);

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

  const calculateTotalDuration = () => {
    return Object.values(audioFiles).reduce(
      (sum, file) => sum + (file.duration || 0),
      0
    );
  };

  // Modify the useEffect that uses videoRef
  useEffect(() => {
    if (currentStep === 3) {
      const totalDuration = calculateTotalDuration();
      setPreviewDuration(totalDuration);

      // Only try to play if we're using video element instead of canvas
      if (videoRef.current && !canvasRef.current) {
        videoRef.current.currentTime = 0;
        videoRef.current.play();
      }
    }
  }, [currentStep, audioFiles]);

  // Modificar la función generateVideoDuration para usar duraciones reales
  const generateVideoDuration = () => {
    let totalDuration = 0;

    // Añadir duración del título
    if (audioFiles['title']) {
      totalDuration += audioFiles['title'].duration;
    }

    // Añadir duración de cada comentario
    selectedComments.forEach((_, index) => {
      const audio = audioFiles[`comment_${index}`];
      if (audio) {
        totalDuration += audio.duration;
      }
    });

    return totalDuration;
  };

  // Modificar la función generateVideo para incluir la generación de audio
  const generateVideo = async () => {
    try {
      setIsGenerating(true);
      setProgress(0);

      // 1. Calculate total duration from all audio segments
      const totalDuration = scriptSegments.reduce((total, segment) => total + segment.duration, 0);
      console.log('📊 Total duration:', totalDuration, 'seconds');

      // 1. Load FFmpeg
      console.log('🔧 Loading FFmpeg...');
      const ffmpeg = new FFmpeg();

      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });

      console.log('✅ FFmpeg loaded successfully');

      // 2. Prepare the canvas for the rendering
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1920;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get canvas context');

      // 3. Render video for the total duration
      console.log('🎨 Starting video rendering...');
      const chunks: Blob[] = [];
      const stream = canvas.captureStream(30);
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm',
        videoBitsPerSecond: 8000000
      });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      const recordingPromise = new Promise<Blob>((resolve) => {
        mediaRecorder.onstop = () => {
          const videoBlob = new Blob(chunks, { type: 'video/webm' });
          resolve(videoBlob);
        };
      });

      mediaRecorder.start(1000);

      // 4. Render each segment with its correct duration
      let currentTime = 0;
      for (const segment of scriptSegments) {
        console.log(`🎬 Rendering segment at ${currentTime}s for ${segment.duration}s`);

        // Load background image
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.crossOrigin = "anonymous";
          img.src = segment.image;
        });

        // Draw image and text for the segment duration
        const startTime = Date.now();
        while (Date.now() - startTime < segment.duration * 1000) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          drawMessage(ctx, segment.text, isDarkMode);
          await new Promise(requestAnimationFrame);
        }

        currentTime += segment.duration;
      }

      mediaRecorder.stop();
      const videoBlob = await recordingPromise;

      // 5. Generate final audio
      console.log('🎵 Generating final audio...');
      const audioBlobs = await Promise.all(
        scriptSegments.map(async segment => {
          const response = await fetch(segment.audio);
          return response.blob();
        })
      );

      try {
        // 6. Write files to FFmpeg
        console.log('📝 Writing files to FFmpeg...');
        const videoArrayBuffer = await videoBlob.arrayBuffer();
        await ffmpeg.writeFile('video.webm', new Uint8Array(videoArrayBuffer));

        for (let i = 0; i < audioBlobs.length; i++) {
          const audioArrayBuffer = await audioBlobs[i].arrayBuffer();
          await ffmpeg.writeFile(`audio${i}.mp3`, new Uint8Array(audioArrayBuffer));
        }

        // Create concat file for audio
        const concatContent = audioBlobs
          .map((_, i) => `file 'audio${i}.mp3'`)
          .join('\n');
        await ffmpeg.writeFile('concat.txt', new TextEncoder().encode(concatContent));

        // 7. Combine video and audio ensuring they match in duration
        console.log('🔄 Combining video and audio...');
        await ffmpeg.exec([
          '-i', 'video.webm',
          '-f', 'concat',
          '-safe', '0',
          '-i', 'concat.txt',
          '-c:v', 'copy',
          '-c:a', 'aac',
          '-map', '0:v:0',
          '-map', '1:a:0',
          '-shortest',
          'output.mp4'
        ]);

        const data = await ffmpeg.readFile('output.mp4');
        const finalVideo = new Blob([data.buffer], { type: 'video/mp4' });
        setPrerenderedVideo(finalVideo);
        setCurrentStep(4);
        setProgress(100);

      } catch (ffmpegError) {
        console.error('❌ FFmpeg processing error:', ffmpegError);
        throw new Error('Failed to process video with FFmpeg');
      }

    } catch (error) {
      console.error('❌ Error generating video:', error);
      alert('Error generating video. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Añadir función para reproducir secuencialmente
  const playAllAudiosSequentially = async () => {
    // Reproducir el título primero
    if (audioFiles['title']) {
      const titleAudio = new Audio(audioFiles['title'].audio);
      await titleAudio.play();

      // Esperar a que termine el título
      await new Promise(resolve => {
        titleAudio.onended = resolve;
      });
    }

    // Reproducir cada comentario en orden
    for (let i = 0; i < selectedComments.length; i++) {
      const audioKey = `comment_${i}`;
      if (audioFiles[audioKey]) {
        const commentAudio = new Audio(audioFiles[audioKey].audio);
        await commentAudio.play();

        // Esperar a que termine cada comentario
        await new Promise(resolve => {
          commentAudio.onended = resolve;
        });
      }
    }

    // Cuando termine todo, resetear
    setIsVideoPlaying(false);
    setCurrentMessageIndex(-1);
  };

  // Añadir función para pausar todos los audios
  const pauseAllAudios = () => {
    // Pausar todos los elementos de audio activos
    document.querySelectorAll('audio').forEach(audio => {
      audio.pause();
    });
  };

  // Iniciar reproducción automática cuando se generen los audios
  useEffect(() => {
    if (audioFiles.title && currentStep === 4) {

    }
  }, [audioFiles, currentStep]);

  useEffect(() => {
    if (currentStep === 3 || currentStep === 4) {
      // Calcular la duración total real
      const totalDuration = generateVideoDuration();
      setPreviewDuration(totalDuration);

      if (videoRef.current) {
        const video = videoRef.current;
        video.currentTime = 0;

        const updatePreview = () => {
          if (video.currentTime >= totalDuration) {
            video.pause();
            setIsVideoPlaying(false);
            setCurrentMessageIndex(-1);
            return;
          }

          setPreviewCurrentTime(video.currentTime);

          // Calcular qué mensaje mostrar basado en el tiempo actual
          let accumulatedTime = 0;
          let messageIndex = -1;

          // Verificar el título
          if (audioFiles['title']) {
            if (video.currentTime < audioFiles['title'].duration) {
              messageIndex = 0;
            }
            accumulatedTime += audioFiles['title'].duration;
          }

          // Verificar cada comentario
          for (let i = 0; i < selectedComments.length; i++) {
            const audioKey = `comment_${i}`;
            if (audioFiles[audioKey]) {
              if (video.currentTime >= accumulatedTime &&
                  video.currentTime < accumulatedTime + audioFiles[audioKey].duration) {
                messageIndex = i + 1;
                break;
              }
              accumulatedTime += audioFiles[audioKey].duration;
            }
          }

          if (messageIndex <= selectedComments.length) {
            setCurrentMessageIndex(messageIndex);
          }
        };

        video.addEventListener('timeupdate', updatePreview);
        return () => {
          video.removeEventListener('timeupdate', updatePreview);
        };
      }
    }
  }, [currentStep, selectedComments.length, audioFiles]);

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

    if (!ctx || !scriptData) return;

    let animationFrameId: number;
    let startTime: number | null = null;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const currentTime = elapsed / 1000; // convertir a segundos

      // Encontrar el segmento actual
      const currentSegment = scriptSegments.find(
        segment => currentTime >= segment.startTime &&
                   currentTime < segment.startTime + segment.duration
      );

      if (currentSegment) {
        // Cargar y dibujar la imagen de fondo
        const img = new Image();
        img.src = currentSegment.image;
        img.onload = () => {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          // Dibujar el texto sobre la imagen
          drawMessage(ctx, currentSegment.text, isDarkMode);
        };
      }

      // Continuar la animación si el video está reproduciéndose
      if (isVideoPlaying) {
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    if (isVideoPlaying) {
      animationFrameId = requestAnimationFrame(animate);
    }

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isVideoPlaying, scriptData, scriptSegments, isDarkMode]);

  // Modificar el useEffect que maneja la reproducción automática
  useEffect(() => {
    if (currentStep === 3) {
      setCurrentMessageIndex(0);
      setIsPlaying(true);

      // Calcular la duración total basada en los segmentos
      const totalDuration = scriptSegments.reduce(
        (sum, segment) => sum + segment.duration,
        0
      );
      setPreviewDuration(totalDuration);

      // Iniciar la animación
      setIsVideoPlaying(true);
    }
  }, [currentStep, scriptSegments]);

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

  // Modificar la función drawMessage
  const drawMessage = (
    ctx: CanvasRenderingContext2D,
    text: string,
    isDarkMode: boolean
  ) => {
    const cardWidth = ctx.canvas.width * 0.8;
    const cardX = (ctx.canvas.width - cardWidth) / 2;
    const cardY = ctx.canvas.height * 0.7;

    // Dibujar fondo semi-transparente para el texto
    ctx.fillStyle = isDarkMode ? 'rgba(0, 0, 0, 0.7)' : 'rgba(255, 255, 255, 0.7)';
    ctx.fillRect(cardX, cardY, cardWidth, 200);

    // Dibujar el texto
    ctx.fillStyle = isDarkMode ? '#FFFFFF' : '#000000';
    ctx.font = '32px Arial';
    wrapText(ctx, text, cardX + 20, cardY + 40, cardWidth - 40, 40);
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

  // Modificar la función handleSeek
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setPreviewCurrentTime(time);

    // Encontrar el segmento actual basado en el tiempo
    const currentSegment = scriptSegments.find(
      segment => time >= segment.startTime &&
                 time < segment.startTime + segment.duration
    );

    if (currentSegment) {
      const segmentIndex = scriptSegments.indexOf(currentSegment);
      setCurrentMessageIndex(segmentIndex);
    } else {
      setCurrentMessageIndex(-1);
    }
  };

  // Modificar handleGenerateVideo para usar las duraciones correctas
  const handleGenerateVideo = async () => {
    if (!isReadyToRecord) return;
    console.log('🎥 Starting new video generation...');

    try {
      setIsPrerendering(true);
      setPrerenderProgress(0);
      setIsPaused(false);
      setIsReadyToRecord(false);

      // Calcular la duración total real basada en los audios
      const totalDuration = generateVideoDuration();
      totalDurationRef.current = totalDuration * 1000; // Convertir a milisegundos
      startTimeRef.current = Date.now();

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
          if (!ctx || !scriptData || messageStats.length === 0) return;
          if (isPaused && !needsResume) return;

          // Calcular el frame actual usando módulo
          const frameIndex = currentFrameIndex % framesRef.current.length;
          const currentFrame = framesRef.current[frameIndex];

          // Dibujar el frame actual
          ctx.drawImage(currentFrame, 0, 0, hiddenCanvas.width, hiddenCanvas.height);

          // Calcular el tiempo actual
          const currentTime = Date.now() - startTimeRef.current;
          const progress = (currentTime / totalDurationRef.current) * 100;

          // Calcular qué mensaje mostrar basado en las duraciones reales
          let accumulatedTime = 0;
          let messageIndex = -1;

          // Verificar el título
          if (audioFiles['title']) {
            if (currentTime < audioFiles['title'].duration * 1000) {
              messageIndex = 0;
            }
            accumulatedTime += audioFiles['title'].duration * 1000;
          }

          // Verificar cada comentario
          for (let i = 0; i < selectedComments.length; i++) {
            const audioKey = `comment_${i}`;
            if (audioFiles[audioKey]) {
              if (currentTime >= accumulatedTime &&
                  currentTime < accumulatedTime + audioFiles[audioKey].duration * 1000) {
                messageIndex = i + 1;
                break;
              }
              accumulatedTime += audioFiles[audioKey].duration * 1000;
            }
          }

          // Dibujar el mensaje actual
          if (messageIndex >= 0) {
            drawMessage(ctx, messageIndex, isDarkMode);
          }

          // Actualizar progreso
          if (!isPaused) {
            setPrerenderProgress(Math.min(progress, 99));
          }

          // Detener si hemos superado la duración total
          if (currentTime >= totalDurationRef.current) {
            mediaRecorder.stop();
            return;
          }

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
    } catch (error) {
      console.error('❌ Error pre-rendering video:', error);
      alert('Error generating video. Please try again.');
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
      a.download = `reddit-video-${Date.now()}.mp4`;
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
    if (!prerenderedVideo || !scriptData) return;

    try {
      setIsDownloading(true);
      setDownloadProgress(0);

      // 1. Generate TTS for title and all selected comments
      console.log('🎙️ Generating TTS audio for all content...');
      const audioSegments: Blob[] = [];

      // Generate title audio
      const titleAudio = await generateSpeech(scriptData.title);
      if (titleAudio) {
        const response = await fetch(titleAudio);
        const blob = await response.blob();
        audioSegments.push(blob);
      }

      // Generate audio for each selected comment
      for (const commentIndex of selectedComments) {
        const comment = scriptData.commentsList[commentIndex];
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
      onClick={generateVideo}
      className={`bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all ${
        isGenerating ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700'
      }`}
      disabled={isGenerating}
    >
      {isGenerating ? (
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          {progress > 0 ? `${Math.round(progress)}%` : 'Generating...'}
        </div>
      ) : (
        'Generate Video'
      )}
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

  // Modificar el useEffect que verifica si está listo para grabar
  useEffect(() => {
    const checkIfReady = async () => {
      try {
        if (
          scriptSegments.length > 0 &&
          scriptData &&
          scriptSegments.every(segment => segment.image && segment.audio)
        ) {
          setIsReadyToRecord(true);
        }
      } catch (error) {
        console.error('Error checking if ready:', error);
        setIsReadyToRecord(false);
      }
    };

    checkIfReady();
  }, [scriptSegments, scriptData]);

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

      {/* Step 1: Create Script */}
      {currentStep === 1 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold mb-4">Create Script</h2>
          <form onSubmit={handleScriptGeneration} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Video Topic
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="E.g.: '5 tips for better productivity'"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Style
              </label>
              <select
                value={selectedStyle}
                onChange={(e) => setSelectedStyle(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg"
              >
                <option value="casual">Casual</option>
                <option value="professional">Professional</option>
                <option value="educational">Educational</option>
                <option value="entertaining">Entertaining</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Duration (seconds)
              </label>
              <input
                type="number"
                value={targetDuration}
                onChange={(e) => setTargetDuration(Number(e.target.value))}
                min="30"
                max="180"
                className="w-full px-4 py-2 border rounded-lg"
              />
            </div>

            <button
              type="submit"
              disabled={isGenerating}
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isGenerating ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Generating Script...
                </>
              ) : (
                'Generate Script'
              )}
            </button>
          </form>
        </div>
      )}

      {/* Step 2: Select Comments */}
      {currentStep === 2 && scriptData && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold mb-4">Preview Script</h2>
          <div className="space-y-4">
            {scriptSegments.map((segment, index) => (
              <div key={index} className="p-4 border rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500">Segment {index + 1}</span>
                  <span className="text-sm text-gray-500">
                    {segment.duration.toFixed(1)}s
                  </span>
                </div>
                <p className="text-gray-800">{segment.text}</p>
                {segment.image && (
                  <img
                    src={segment.image}
                    alt={`Background for segment ${index + 1}`}
                    className="mt-2 rounded-lg h-32 w-full object-cover"
                  />
                )}
              </div>
            ))}
            <button
              onClick={() => setCurrentStep(3)}
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700"
            >
              Continue to Preview
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Customize */}
      {currentStep === 3 && scriptData && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold mb-4">Customize Video</h2>
          <div className="flex gap-6">
            {/* Preview lado izquierdo */}
            <div className="w-1/2">
              <div className="sticky top-4">
                <h3 className="font-medium mb-4">Preview</h3>
                <div className="relative aspect-[9/16] bg-black rounded-lg overflow-hidden">
                  <canvas
                    ref={canvasRef}
                    className="absolute inset-0 w-full h-full"
                    width={1080}
                    height={1920}
                  />

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
              {prerenderedVideo ? (
                <video
                  src={URL.createObjectURL(prerenderedVideo)}
                  className="absolute inset-0 w-full h-full"
                  controls
                  playsInline
                  controlsList="nodownload"
                />
              ) : (
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 w-full h-full"
                  width={1080}
                  height={1920}
                />
              )}
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
                  Downloading...
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
