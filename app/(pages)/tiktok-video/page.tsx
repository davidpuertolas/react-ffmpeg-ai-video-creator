"use client";

import { useState, useEffect, useRef } from "react";
import { ArrowRightIcon } from "@heroicons/react/24/outline";
import OpenAI from 'openai';
import html2canvas from 'html2canvas';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import RecordRTC from 'recordrtc';
import { fetchFile } from '@ffmpeg/util';

const steps = [
  { id: 1, name: "Content" },
  { id: 2, name: "Customize" },
  { id: 3, name: "Generate" },
];

// Modify the MessageData interface to be StoryData
interface StoryData {
  title: string;
  narrator: string;
  segments: {
    content: string;
    timestamp: string;
  }[];
  participants: {
    user1: string;
    user2: string;
  };
}

// Inicializar OpenAI
const openai = new OpenAI({
  apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true // Solo para desarrollo
});

// Definir las voces de una manera más simple
const VOICE_OPTIONS = [
  { id: 'alloy', name: 'Neutral', demo: '/voices/alloy.wav' },
  { id: 'echo', name: 'Radio Host', demo: '/voices/echo.wav' },
  { id: 'fable', name: 'Storyteller', demo: '/voices/fable.wav' },
  { id: 'onyx', name: 'News Anchor', demo: '/voices/onyx.wav' },
  { id: 'nova', name: 'Assistant', demo: '/voices/nova.wav' },
  { id: 'shimmer', name: 'Young', demo: '/voices/shimmer.wav' },
  { id: 'coral', name: 'Friendly', demo: '/voices/coral.wav' },
  { id: 'sage', name: 'Elder', demo: '/voices/sage.wav' },
  { id: 'ash', name: 'Pro', demo: '/voices/ash.wav' }
];

// Primero definimos las opciones de video disponibles
const VIDEO_OPTIONS = [
  { id: 'minecraft', name: 'Minecraft', src: '/videos/minecraft-vertical.mp4' },
  { id: 'subway', name: 'Subway Surfers', src: '/videos/subway-vertical.mp4' }
];

// Añadir después de VIDEO_OPTIONS
const MUSIC_OPTIONS = [
  { id: 'tense', name: 'Tense', src: '/songs/tense.mp3' },
  { id: 'storytelling', name: 'Storytelling', src: '/songs/storytelling.mp3' }
];

// Añadir este nuevo tipo al inicio del archivo
interface VideoStats {
  duration: number | null;
  size: number | null;
}

export default function StoryVideoPage() {
  // Update state to use StoryData
  const [storyData, setStoryData] = useState<StoryData>({
    title: '',
    narrator: '',
    segments: [],
    participants: {
      user1: 'User 1', // Default names
      user2: 'User 2'
    }
  });

  // Update the state for new segment input
  const [newSegment, setNewSegment] = useState('');

  // Modify the narrator voice state (just one voice now)
  const [narratorVoice, setNarratorVoice] = useState('nova'); // Default to storyteller voice

  // Dentro del componente RedditVideoPage, añadir el estado:
  const [selectedVideo, setSelectedVideo] = useState('minecraft');

  // Añadir el estado para la música seleccionada después de selectedVideo
  const [selectedMusic, setSelectedMusic] = useState('tense');

  // Añadir referencia para el audio de preview
  const musicPreviewRef = useRef<HTMLAudioElement | null>(null);
  const [playingMusic, setPlayingMusic] = useState<string | null>(null);

  // Añadir la función wrapText dentro del componente
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

  // Mover la función generateSpeech dentro del componente
  const generateSpeech = async (text: string, voice: string) => {
    try {
      console.log('🎙️ Generating speech for:', text.substring(0, 50) + '...');
      console.log('Using voice:', voice);

      const startTime = Date.now();
      const response = await openai.audio.speech.create({
        model: "tts-1",
        voice: voice,
        input: text,
      });
      const endTime = Date.now();

      const audioBlob = await response.blob();
      const duration = endTime - startTime;
      const size = audioBlob.size;
      const cost = (text.length / 1000) * 0.015;

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

  const [currentStep, setCurrentStep] = useState(1);
  const [newMessage, setNewMessage] = useState('');
  const [newAuthor, setNewAuthor] = useState('');
  const [titleInput, setTitleInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
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

  // Añadir nueva ref para el video de fondo
  const backgroundVideoRef = useRef<HTMLVideoElement | null>(null);

  // Añadir al inicio del componente
  const [previewFrames, setPreviewFrames] = useState<string[]>([]);

  // Añadir nuevo estado para la voz que se está reproduciendo
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Dentro del componente, añadir el nuevo estado
  const [videoStats, setVideoStats] = useState<VideoStats>({
    duration: null,
    size: null
  });

  // Añadir al inicio del componente
  const [avatarImages, setAvatarImages] = useState<{ [key: number]: HTMLImageElement }>({});

  // Añadir estos estados para controlar el progreso de cada paso
  const [stepsProgress, setStepsProgress] = useState({
    preparing: 0,
    audio: 0,
    video: 0,
    finalizing: 0
  });

  // Añadir una ref para controlar los intervalos
  const intervalsRef = useRef<{
    preparing?: NodeJS.Timeout;
    audio?: NodeJS.Timeout;
    video?: NodeJS.Timeout;
  }>({});

  // Añadir junto a los otros estados al inicio del componente
  const [currentSender, setCurrentSender] = useState<'user1' | 'user2'>('user1');

  // Añadir nuevo estado para las voces de los usuarios
  const [userVoices, setUserVoices] = useState({
    user1: 'alloy',
    user2: 'echo'
  });

  const isValidRedditUrl = (url: string) => {
    const redditPattern = /^https?:\/\/(www\.)?reddit\.com\/r\/[\w-]+\/comments\/[\w-]+\/.*/;
    return redditPattern.test(url);
  };

  const handleMessageSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!titleInput.trim()) {
      alert('Please enter a title');
      return;
    }

    setStoryData({
      title: titleInput,
      narrator: '',
      segments: [],
      participants: {
        user1: 'User 1', // Default names
        user2: 'User 2'
      }
    });
    setCurrentStep(2);
  };

  const handleAddMessage = (e: React.FormEvent) => {
    e.preventDefault();

    if (!newMessage.trim() || !newAuthor.trim()) {
      alert('Please fill in both message and author');
      return;
    }

    setStoryData(prev => ({
      ...prev,
      segments: [...prev.segments, {
        content: newMessage,
        timestamp: new Date().toLocaleTimeString()
      }]
    }));

    // Limpiar el formulario
    setNewMessage('');
    setNewAuthor('');
  };

  // Añadir esta función después de las interfaces
  const calculateApproximateDuration = (text: string): number => {
    // Una aproximación básica: ~3 caracteres por segundo
    return text.length / 15;
  };

  // Modificar la función toggleComment
  const toggleComment = (index: number) => {
    setSelectedComments(prev => {
      // Si ya está seleccionado, simplemente lo removemos
      if (prev.includes(index)) {
        return prev.filter(i => i !== index);
      }

      // Calcular la duración total con el nuevo comentario
      let totalText = storyData!.title; // Incluir el título
      const newSelected = [...prev, index];
      newSelected.forEach(i => {
        totalText += storyData!.segments[i].content;
      });

      const approximateDuration = calculateApproximateDuration(totalText);

      // Si excede 60 segundos, mostrar advertencia
      if (approximateDuration > 60) {
        //alert("⚠️ Warning: The selected content may create a video longer than 60 seconds. The video will be automatically trimmed to 60 seconds.");
      }

      return newSelected;
    });
  };

  const handlePlayPause = () => {
    setIsVideoPlaying(!isVideoPlaying);

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
          setCurrentMessageIndex(0);
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

  useEffect(() => {
    if (currentStep === 3) {
      const totalDuration = calculateTotalDuration();
      setPreviewDuration(totalDuration);

      const video = videoRef.current;
      if (video) {
        video.currentTime = 0;
        video.play();
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

  // Añadir esta función para obtener la duración de un audio
  const getAudioDuration = async (blob: Blob): Promise<number> => {
    return new Promise((resolve) => {
      const audio = new Audio(URL.createObjectURL(blob));
      audio.addEventListener('loadedmetadata', () => {
        resolve(audio.duration);
      });
    });
  };

  // Mover la función executeFFmpegWithTimeout fuera de generateVideo
  const executeFFmpegWithTimeout = async (ffmpeg: FFmpeg, command: string[], timeoutMs: number = 300000) => {
    return new Promise<void>(async (resolve, reject) => {
      // Timeout handler
      const timeoutId = setTimeout(() => {
        reject(new Error('FFmpeg execution timed out'));
      }, timeoutMs);

      try {
        // Progress logging
        let lastProgress = 0;
        ffmpeg.on('progress', (progress) => {
          const currentProgress = Math.round(progress.progress * 100);
          if (currentProgress > lastProgress) {
            console.log(`🎬 FFmpeg Progress: ${currentProgress}%`);
            lastProgress = currentProgress;
          }
        });

        // Execute command
        await ffmpeg.exec(command);
        clearTimeout(timeoutId);
        resolve();
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  };

  // Función para pre-cargar las imágenes
  const preloadAvatarImages = async () => {
    const loadImage = (index: number) => {
      return new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.src = `/redditimages/${index + 1}.jpg`;
        img.onload = () => resolve(img);
        img.onerror = reject;
      });
    };

    try {
      const images: { [key: number]: HTMLImageElement } = {};
      await Promise.all(
        avatarIndices.map(async (_, index) => {
          images[index] = await loadImage(avatarIndices[index]);
        })
      );
      setAvatarImages(images);
    } catch (error) {
      console.error('Error preloading avatar images:', error);
    }
  };

  // Modificar el useEffect del progreso
  useEffect(() => {
    if (isGenerating) {
      let isMounted = true;

      const startPreparingPhase = () => {
        let preparingProgress = 0;
        intervalsRef.current.preparing = setInterval(() => {
          if (!isMounted) return;
          preparingProgress = Math.min(preparingProgress + 2, 100);
          setStepsProgress(prev => ({
            ...prev,
            preparing: preparingProgress
          }));
          setProgress(Math.min(20 * (preparingProgress / 100), 20));

          if (preparingProgress >= 100) {
            clearInterval(intervalsRef.current.preparing);
            startAudioPhase();
          }
        }, 100);
      };

      const startAudioPhase = () => {
        let audioProgress = 0;
        intervalsRef.current.audio = setInterval(() => {
          if (!isMounted) return;
          audioProgress = Math.min(audioProgress + 1, 100);
          setStepsProgress(prev => ({
            ...prev,
            audio: audioProgress
          }));
          setProgress(20 + (25 * (audioProgress / 100)));

          if (audioProgress >= 100) {
            clearInterval(intervalsRef.current.audio);
            startVideoPhase();
          }
        }, 100);
      };

      const startVideoPhase = () => {
        let videoProgress = 0;
        intervalsRef.current.video = setInterval(() => {
          if (!isMounted) return;
          videoProgress = Math.min(videoProgress + 0.33, 100);
          setStepsProgress(prev => ({
            ...prev,
            video: videoProgress
          }));
          setProgress(45 + (50 * (videoProgress / 100)));

          if (videoProgress >= 100) {
            clearInterval(intervalsRef.current.video);
            // No establecer finalizing aquí, se hará cuando el video esté realmente listo
          }
        }, 100);
      };

      // Iniciar la secuencia
      startPreparingPhase();

      // Cleanup function
      return () => {
        isMounted = false;
        Object.values(intervalsRef.current).forEach(interval => {
          if (interval) clearInterval(interval);
        });
      };
    }
  }, [isGenerating]); // Solo depende de isGenerating

  // Modificar la función generateVideo para manejar correctamente los tiempos de audio
  const generateVideo = async () => {
    try {
      setIsGenerating(true);
      setProgress(0);

      // Pre-cargar las imágenes antes de comenzar
      await preloadAvatarImages();

      // 1. Load FFmpeg
      console.log('🔧 Loading FFmpeg...');
      const ffmpeg = new FFmpeg();

      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
      console.log('📦 Loading FFmpeg core files from:', baseURL);
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript'),
      });

      console.log('✅ FFmpeg loaded successfully');
      setProgress(10);

      // 2. Generate audio files
      console.log('🎙️ Starting audio generation...');
      const audioFiles: { [key: string]: { blob: Blob; duration: number } } = {};
      let totalDuration = 0;

      // Generar audio para cada mensaje
      for (let i = 0; i < storyData.segments.length; i++) {
        const segment = storyData.segments[i];
        const audioUrl = await generateSpeech(segment.content, narratorVoice);
        if (audioUrl) {
          const response = await fetch(audioUrl);
          const blob = await response.blob();
          const duration = await getAudioDuration(blob);
          audioFiles[`message_${i}`] = { blob, duration };
          totalDuration += duration + 0.3; // Añadir 0.3s entre segmentos
          console.log(`💾 Segment ${i + 1} audio duration:`, duration.toFixed(2), 's');
        }
        setProgress(10 + (i + 1) / storyData.segments.length * 30);
      }

      // 3. Write files to FFmpeg
      console.log('📝 Writing files to FFmpeg...');

      // Write background video
      console.log('🎬 Writing background video...');
      const selectedVideoSrc = VIDEO_OPTIONS.find(v => v.id === selectedVideo)?.src || '';
      console.log('🎥 Selected video source:', selectedVideoSrc);
      const videoResponse = await fetch(selectedVideoSrc);
      const videoData = await videoResponse.arrayBuffer();
      console.log('📦 Background video size:', (videoData.byteLength / (1024 * 1024)).toFixed(2), 'MB');
      await ffmpeg.writeFile('background.mp4', new Uint8Array(videoData));
      console.log('✅ Background video written successfully');

      // Write audio files
      console.log('🎵 Writing audio files...');
      for (const [key, { blob, duration }] of Object.entries(audioFiles)) {
        console.log(`📝 Writing ${key} audio...`);
        await ffmpeg.writeFile(`${key}.mp3`, new Uint8Array(await blob.arrayBuffer()));
        console.log(`✅ ${key} audio written successfully`);
      }

      // Write background music
      console.log('🎼 Writing background music...');
      const selectedMusicSrc = MUSIC_OPTIONS.find(m => m.id === selectedMusic)?.src || '';
      console.log('🎵 Selected music source:', selectedMusicSrc);
      const musicResponse = await fetch(selectedMusicSrc);
      const musicData = await musicResponse.arrayBuffer();
      console.log('📦 Background music size:', (musicData.byteLength / 1024).toFixed(2), 'KB');
      await ffmpeg.writeFile('background_music.mp3', new Uint8Array(musicData));
      console.log('✅ Background music written successfully');

      setProgress(50);

      // 4. Generate overlay images
      console.log('🎨 Starting overlay image generation...');
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1920;
      const ctx = canvas.getContext('2d')!;

      // Generate and save overlay images
      console.log(`📸 Generating ${storyData.segments.length} overlay images...`);
      const overlayImages = [];
      for (let i = 0; i < storyData.segments.length; i++) {
        console.log(`🖼️ Generating overlay ${i + 1}/${storyData.segments.length}`);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        await drawMessage(ctx, i, isDarkMode, storyData, []); // Ya no necesitamos selectedComments
        const blob = await new Promise<Blob>(resolve => {
          canvas.toBlob(blob => resolve(blob!), 'image/png');
        });
        console.log(`📦 Overlay ${i + 1} size:`, (blob.size / 1024).toFixed(2), 'KB');
        await ffmpeg.writeFile(`overlay_${i}.png`, new Uint8Array(await blob.arrayBuffer()));
        overlayImages.push(`overlay_${i}.png`);
        console.log(`✅ Overlay ${i + 1} written successfully`);
        setProgress(50 + (i + 1) / storyData.segments.length * 20);
      }

      // 5. Create complex filter
      console.log('🔧 Creating FFmpeg filter complex...');
      let filterComplex = '';
      let overlayChain = '[v' + (overlayImages.length - 1) + ']';
      let audioInputs = '';
      let audioMixInputs = '';

      // Calcular los tiempos de inicio y fin de cada mensaje
      let currentTime = 0;
      const messageTiming = storyData.segments.map((_, index) => {
        const audio = audioFiles[`message_${index}`];
        const timing = {
          start: currentTime,
          end: currentTime + (audio?.duration || 0)
        };
        currentTime += (audio?.duration || 0) + 0.2; // Añadir 0.2s entre mensajes
        return timing;
      });

      console.log('📊 Message timings:', messageTiming);
      console.log('⏱️ Total duration:', totalDuration.toFixed(2), 'seconds');

      // Scale and pad background video
      filterComplex += '[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2[bg];';

      // Process overlays with exact timings
      overlayImages.forEach((img, i) => {
        filterComplex += `[${i + 1}:v]scale=1080:1920[img${i}];`;
        filterComplex += i === 0
          ? `[bg][img${i}]overlay=0:0:enable='between(t,${messageTiming[i].start},${messageTiming[i].end + 0.2})'[v${i}];`
          : `[v${i-1}][img${i}]overlay=0:0:enable='between(t,${messageTiming[i].start},${messageTiming[i].end + 0.2})'[v${i}];`;
      });

      // Build audio inputs string
      Object.keys(audioFiles).forEach((_, i) => {
        audioInputs += `[${i + overlayImages.length + 1}:a]`;
        audioMixInputs += `[a${i}]`;
      });

      // Process audio
      filterComplex += `${audioInputs}concat=n=${Object.keys(audioFiles).length}:v=0:a=1[speech];`;
      filterComplex += `[${Object.keys(audioFiles).length + overlayImages.length + 1}:a]volume=0.3,aloop=loop=-1:size=2147483647[music];`;
      filterComplex += `[speech][music]amix=inputs=2:duration=longest[aout]`;

      console.log('📝 Final filter complex:', filterComplex);

      // 6. Execute FFmpeg command
      console.log('🎬 Executing FFmpeg command...');
      const ffmpegCommand = [
        '-i', 'background.mp4',
        ...overlayImages.map(img => ['-i', img]).flat(),
        ...Object.keys(audioFiles).map(key => ['-i', `${key}.mp3`]).flat(),
        '-i', 'background_music.mp3',
        '-filter_complex', filterComplex,
        '-map', overlayChain,
        '-map', '[aout]',
        '-t', Math.ceil(totalDuration).toString(), // Redondear hacia arriba para asegurar que no se corte nada
        // Añadir estos parámetros para mejorar el rendimiento y la estabilidad
        '-preset', 'ultrafast',
        '-tune', 'zerolatency',
        '-movflags', '+faststart',
        '-pix_fmt', 'yuv420p',
        // Ajustar la calidad del video
        '-crf', '28',
        '-maxrate', '2500k',
        '-bufsize', '5000k',
        // Ajustar el audio
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-b:a', '192k',
        // Forzar el overwrite del archivo de salida
        '-y',
        'output.mp4'
      ];

      console.log('📝 FFmpeg command:', ffmpegCommand.join(' '));

      try {
        await executeFFmpegWithTimeout(ffmpeg, ffmpegCommand);
        console.log('✅ FFmpeg command executed successfully');
      } catch (error) {
        if (error.message === 'FFmpeg execution timed out') {
          console.error('⏰ FFmpeg execution timed out after 5 minutes');
          throw new Error('Video generation took too long. Please try with fewer comments or a shorter video.');
        }
        throw error;
      }

      setProgress(90);

      // 7. Read and set final video
      console.log('📤 Reading final video...');
      const data = await ffmpeg.readFile('output.mp4');
      const finalVideo = new Blob([data], { type: 'video/mp4' });

      // Obtener la duración real del video
      const videoDuration = await new Promise<number>((resolve) => {
        const videoElement = document.createElement('video');
        videoElement.src = URL.createObjectURL(finalVideo);
        videoElement.addEventListener('loadedmetadata', () => {
          const duration = videoElement.duration;
          setVideoStats({
            duration: duration,
            size: data.length / (1024 * 1024) // Tamaño en MB
          });
          resolve(duration);
          URL.revokeObjectURL(videoElement.src);
        });
      });

      console.log('⏱️ Final video duration:', videoDuration.toFixed(2), 'seconds');
      console.log('📦 Final video size:', (data.length / (1024 * 1024)).toFixed(2), 'MB');

      // Establecer el video pre-renderizado
      setPrerenderedVideo(finalVideo);
      console.log('✅ Final video processed successfully');

      // Actualizar el progreso final
      setStepsProgress(prev => ({
        ...prev,
        finalizing: 100
      }));
      setProgress(100);

      // Cambiar al paso final
      setCurrentStep(3);
      setIsGenerating(false);

    } catch (error) {
      console.error('❌ Error generating video:', error);
      console.error('🔍 Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      alert('Error generating video. Please try again.');
      // Limpiar los intervalos en caso de error
      Object.values(intervalsRef.current).forEach(interval => {
        if (interval) clearInterval(interval);
      });
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
    const video = videoRef.current;

    if (!ctx || !video || !storyData) return;

    let animationFrameId: number;
    let startTime: number | null = null;

    const animate = async (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;

      // Dibujar el frame actual del video
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Calcular qué mensaje mostrar
      let currentTime = elapsed / 1000;
      let messageToShow = -1;

      // Verificar el título
      if (audioFiles['title']) {
        if (currentTime < audioFiles['title'].duration) {
          messageToShow = 0;
        }
        currentTime -= audioFiles['title'].duration;
      }

      // Verificar cada comentario
      for (let i = 0; i < selectedComments.length; i++) {
        const audioKey = `comment_${i}`;
        if (audioFiles[audioKey]) {
          if (currentTime >= 0 && currentTime < audioFiles[audioKey].duration) {
            messageToShow = i + 1;
            break;
          }
          currentTime -= audioFiles[audioKey].duration;
        }
      }

      // Dibujar el mensaje actual si hay uno
      if (messageToShow >= 0) {
        await drawMessage(ctx, messageToShow, isDarkMode, storyData, selectedComments);
      }

      // Continuar la animación si el video está reproduciéndose
      if (isVideoPlaying) {
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    if (isVideoPlaying) {
      video.play();
      animationFrameId = requestAnimationFrame(animate);
    } else {
      video.pause();
    }

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      video.pause();
    };
  }, [isVideoPlaying, storyData, selectedComments, audioFiles, isDarkMode]);

  // Modificar la función drawMessage para mostrar subtítulos
  const drawMessage = async (
    ctx: CanvasRenderingContext2D,
    messageIndex: number,
    isDarkMode: boolean,
    storyData: StoryData,
    selectedComments: number[]
  ) => {
    // Limpiar el canvas
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    // Configurar el estilo del texto
    const fontSize = 48; // Tamaño más grande para subtítulos
    const maxWidth = ctx.canvas.width * 0.9; // 90% del ancho del canvas
    const padding = 40;

    // Obtener el mensaje actual
    const message = storyData.segments[messageIndex];
    if (!message) return;

    // Configurar el estilo del texto
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    // Dividir el texto en líneas
    const words = message.content.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine + (currentLine ? ' ' : '') + word;
      const metrics = ctx.measureText(testLine);

      if (metrics.width > maxWidth) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    lines.push(currentLine);

    // Calcular la altura total del texto
    const lineHeight = fontSize * 1.2;
    const totalHeight = lines.length * lineHeight;

    // Dibujar el fondo semi-transparente para los subtítulos
    const subtitleY = ctx.canvas.height - padding - totalHeight;
    ctx.fillStyle = isDarkMode ? 'rgba(0, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, subtitleY - padding, ctx.canvas.width, totalHeight + padding * 2);

    // Dibujar cada línea de texto
    ctx.fillStyle = '#FFFFFF'; // Texto blanco para mejor contraste
    lines.forEach((line, index) => {
      const y = subtitleY + (index * lineHeight);
      ctx.fillText(line, ctx.canvas.width / 2, y);
    });

    // Opcional: Mostrar el nombre del hablante
    const speaker = message.author === storyData.participants.user1
      ? storyData.participants.user1
      : storyData.participants.user2;

    ctx.font = `bold ${fontSize * 0.7}px Arial`;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(speaker, ctx.canvas.width / 2, subtitleY - padding - 10);
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

    // Calcular qué mensaje mostrar basado en el tiempo
    let accumulatedTime = 0;
    let messageIndex = -1;

    // Verificar el título primero
    if (audioFiles['title']) {
      if (time < audioFiles['title'].duration) {
        messageIndex = 0;
      }
      accumulatedTime += audioFiles['title'].duration;
    }

    // Verificar cada comentario
    for (let i = 0; i < selectedComments.length; i++) {
      const audioKey = `comment_${i}`;
      if (audioFiles[audioKey]) {
        if (time >= accumulatedTime && time < accumulatedTime + audioFiles[audioKey].duration) {
          messageIndex = i + 1;
          break;
        }
        accumulatedTime += audioFiles[audioKey].duration;
      }
    }

    // Actualizar el estado
    setCurrentMessageIndex(messageIndex);
    setPreviewCurrentTime(time);

    // Actualizar el video si existe
    if (videoRef.current) {
      videoRef.current.currentTime = time;
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
        hiddenVideo.src = VIDEO_OPTIONS.find(v => v.id === selectedVideo)?.src || '/videos/minecraft-vertical.mp4';
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
          if (!ctx || !storyData || messageStats.length === 0) return;
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
            drawMessage(ctx, messageIndex, isDarkMode, storyData, selectedComments);
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
        const comment = storyData.segments[commentIndex];
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

      // Modificar dentro de handleDownloadMixed, después de escribir los archivos de audio
      // Escribir el archivo de música de fondo
      const musicResponse = await fetch(MUSIC_OPTIONS.find(m => m.id === selectedMusic)?.src || '');
      const musicData = await musicResponse.arrayBuffer();
      await ffmpeg.writeFile('background_music.mp3', new Uint8Array(musicData));

      // Modificar el comando de FFmpeg para incluir la música de fondo
      await ffmpeg.exec([
        '-i', 'video.webm',
        '-i', 'combined_audio.mp3',
        '-i', 'background_music.mp3',
        '-filter_complex', '[1:a]volume=4[a1];[2:a]volume=0.02,aloop=loop=-1:size=2147483647[a2];[a1][a2]amix=inputs=2[aout]',
        '-c:v', 'copy',
        '-map', '0:v:0',
        '-map', '[aout]',
        '-shortest',
        'output.mp4'
      ]);

    } catch (error) {
      console.error('❌ Error creating video with TTS:', error);
      alert('Error creating video with TTS. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  // Añadir este useEffect para manejar los frames de preview
  useEffect(() => {
    if (currentStep === 2 && storyData) {
      // Generar frames para cada mensaje
      const frames = storyData.segments.map((_, index) => {
        const frameNumber = Math.floor((index / Math.max(storyData.segments.length - 1, 1)) * 19) + 1;
        return frameNumber.toString().padStart(3, '0');
      });

      // Actualizar el path de los frames según el video seleccionado
      const videoType = selectedVideo === 'minecraft' ? 'minecraft' : 'subway';
      setPreviewFrames(frames.map(num => `/frames/${videoType}/${num}.jpg`));

      // Iniciar en el primer mensaje
      setCurrentMessageIndex(0);

      // Dibujar el primer mensaje
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawMessage(ctx, 0, isDarkMode, storyData, []);
      }
    }
  }, [currentStep, storyData, selectedVideo, isDarkMode]);

  // Y modificar el useEffect que maneja los cambios de mensaje
  useEffect(() => {
    if (currentStep === 2 && storyData) {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx && currentMessageIndex >= 0 && currentMessageIndex < storyData.segments.length) {
        // Limpiar el canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Dibujar el mensaje actual
        drawMessage(ctx, currentMessageIndex, isDarkMode, storyData, []);

        // Actualizar el video de fondo si existe
        if (videoRef.current) {
          const frameIndex = Math.floor((currentMessageIndex / Math.max(storyData.segments.length - 1, 1)) * 19) + 1;
          const videoType = selectedVideo === 'minecraft' ? 'minecraft' : 'subway';
          videoRef.current.src = `/frames/${videoType}/${frameIndex.toString().padStart(3, '0')}.jpg`;
        }
      }
    }
  }, [currentStep, storyData, currentMessageIndex, isDarkMode, selectedVideo]);

  // Modificar el useEffect inicial para que empiece en el título
  useEffect(() => {
    if (currentStep === 3 && storyData) {
      // Cargar un frame para el título y uno para cada comentario
      const messages = [storyData.title, ...selectedComments.map(i => storyData.segments[i].content)];
      const frames = messages.map((_, index) => {
        // Usar frames espaciados uniformemente del 1 al 20
        const minFrame = 1;
        const maxFrame = 20;
        const frameRange = maxFrame - minFrame;
        const frameNumber = Math.floor((index / (messages.length - 1)) * frameRange + minFrame);
        // Formatear el número con padding de ceros (001, 002, etc)
        return frameNumber.toString().padStart(3, '0');
      });

      // Actualizar el path de los frames según el video seleccionado
      const videoType = selectedVideo === 'minecraft' ? 'minecraft' : 'subway';
      setPreviewFrames(frames.map(num => `/frames/${videoType}/${num}.jpg`));
      setCurrentMessageIndex(0);
    }
  }, [currentStep, storyData, selectedComments, selectedVideo]); // Añadir selectedVideo como dependencia

  // Modificar la función renderStep3Button
  const renderStep3Button = () => (
    <>
      <button
        onClick={generateVideo}
        className="bg-blue-600 text-white px-6 py-3 rounded-lg text-sm font-medium transition-all hover:bg-blue-700 flex items-center gap-2"
        disabled={isGenerating}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
        </svg>
        Generate Video
      </button>

      {/* Modal de progreso */}
      {isGenerating && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-md w-full mx-4 shadow-xl">
            {/* Encabezado */}
            <div className="text-center mb-6">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Generating Your Video
              </h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                This might take a few moments. Please don't close this window.
              </p>
            </div>

            {/* Spinner y progreso */}
            <div className="flex flex-col items-center mb-8">
              {/* Círculo de progreso animado */}
              <div className="relative w-32 h-32 mb-4">
                {/* Círculo de fondo */}
                <svg className="w-full h-full" viewBox="0 0 100 100">
                  <circle
                    className="text-gray-200 dark:text-gray-700"
                    strokeWidth="8"
                    stroke="currentColor"
                    fill="transparent"
                    r="42"
                    cx="50"
                    cy="50"
                  />
                  <circle
                    className="text-blue-600"
                    strokeWidth="8"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="transparent"
                    r="42"
                    cx="50"
                    cy="50"
                    style={{
                      strokeDasharray: `${2 * Math.PI * 42}`,
                      strokeDashoffset: `${2 * Math.PI * 42 * (1 - progress / 100)}`,
                      transform: 'rotate(-90deg)',
                      transformOrigin: '50% 50%',
                      transition: 'stroke-dashoffset 0.5s ease'
                    }}
                  />
                </svg>
                {/* Porcentaje en el centro */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-bold text-gray-900 dark:text-white">
                    {Math.round(progress)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Pasos del proceso actualizados */}
            <div className="space-y-4">
              <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                      stepsProgress.preparing < 100 ? 'bg-blue-500 animate-pulse' : 'bg-green-500'
                    }`} />
                    <span className={`text-sm font-medium ${
                      stepsProgress.preparing < 100 ? 'text-blue-600 dark:text-blue-400' : 'text-green-600 dark:text-green-400'
                    }`}>
                      Preparing assets
                    </span>
                  </div>
                  {stepsProgress.preparing > 0 && (
                    <span className="text-xs font-medium text-gray-500">
                      {Math.round(stepsProgress.preparing)}%
                    </span>
                  )}
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                      stepsProgress.preparing === 100 && stepsProgress.audio < 100
                        ? 'bg-blue-500 animate-pulse'
                        : stepsProgress.audio === 100
                          ? 'bg-green-500'
                          : 'bg-gray-300 dark:bg-gray-600'
                    }`} />
                    <span className={`text-sm font-medium ${
                      stepsProgress.preparing === 100 && stepsProgress.audio < 100
                        ? 'text-blue-600 dark:text-blue-400'
                        : stepsProgress.audio === 100
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-gray-400 dark:text-gray-500'
                    }`}>
                      Generating Audio
                    </span>
                  </div>
                  {stepsProgress.audio > 0 && (
                    <span className="text-xs font-medium text-gray-500">
                      {Math.round(stepsProgress.audio)}%
                    </span>
                  )}
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                      stepsProgress.audio === 100 && stepsProgress.video < 100
                        ? 'bg-blue-500 animate-pulse'
                        : stepsProgress.video === 100
                          ? 'bg-green-500'
                          : 'bg-gray-300 dark:bg-gray-600'
                    }`} />
                    <span className={`text-sm font-medium ${
                      stepsProgress.audio === 100 && stepsProgress.video < 100
                        ? 'text-blue-600 dark:text-blue-400'
                        : stepsProgress.video === 100
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-gray-400 dark:text-gray-500'
                    }`}>
                      Generating video
                    </span>
                  </div>
                  {stepsProgress.video > 0 && (
                    <span className="text-xs font-medium text-gray-500">
                      {Math.round(stepsProgress.video)}%
                    </span>
                  )}
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                      stepsProgress.video === 100 && stepsProgress.finalizing < 100
                        ? 'bg-blue-500 animate-pulse'
                        : stepsProgress.finalizing === 100
                          ? 'bg-green-500'
                          : 'bg-gray-300 dark:bg-gray-600'
                    }`} />
                    <span className={`text-sm font-medium ${
                      stepsProgress.video === 100 && stepsProgress.finalizing < 100
                        ? 'text-blue-600 dark:text-blue-400'
                        : stepsProgress.finalizing === 100
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-gray-400 dark:text-gray-500'
                    }`}>
                      Finalizing
                    </span>
                  </div>
                  {stepsProgress.finalizing > 0 && (
                    <span className="text-xs font-medium text-gray-500">
                      {Math.round(stepsProgress.finalizing)}%
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Tip en la parte inferior */}
            <div className="mt-6 text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                💡 Tip: The video will be ready to download once the generation is complete
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );

  // Añadir estos keyframes en el archivo globals.css o en un estilo en línea
  const shimmerKeyframes = `
    @keyframes shimmer {
      0% {
        transform: translateX(-100%);
      }
      100% {
        transform: translateX(100%);
      }
    }
  `;

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
          video.src = VIDEO_OPTIONS.find(v => v.id === selectedVideo)?.src || '/videos/minecraft-vertical.mp4';
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
  }, [selectedComments.length, storyData, messageStats.length, avatarIndices.length, selectedVideo]);

  // Modificar el useEffect que maneja la reproducción automática
  useEffect(() => {
    if (currentStep === 3) {
      setCurrentMessageIndex(0);
      setIsPlaying(true);

      const video = videoRef.current;
      if (video) {
        video.currentTime = 0;
        video.play();
      }

      // Calcular la duración total basada en los audios si están disponibles
      if (Object.keys(audioFiles).length > 0) {
        const totalDuration = Object.values(audioFiles).reduce(
          (sum, file) => sum + file.duration,
          0
        );
        setPreviewDuration(totalDuration);
      }
    }
  }, [currentStep, audioFiles]);

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

  // Modificar el useEffect que maneja la preview
  useEffect(() => {
    if (currentStep === 2 && storyData) {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx && currentMessageIndex >= 0 && currentMessageIndex < storyData.segments.length) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawMessage(ctx, currentMessageIndex, isDarkMode, storyData, []);
      }
    }
  }, [currentStep, storyData, currentMessageIndex, isDarkMode]); // Añadir currentMessageIndex como dependencia

  // Añadir useEffect para actualizar el canvas cuando cambia el mensaje
  useEffect(() => {
    if (currentStep === 3 && storyData) {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (currentMessageIndex >= 0) {
          drawMessage(ctx, currentMessageIndex, isDarkMode, storyData, selectedComments);
        }
      }
    }
  }, [currentMessageIndex, isDarkMode, currentStep, storyData, selectedComments]);

  // Añadir al inicio del componente, junto con los otros useEffect
  useEffect(() => {
    return () => {
      // Cleanup de la música de preview
      if (musicPreviewRef.current) {
        musicPreviewRef.current.pause();
        musicPreviewRef.current = null;
      }
    };
  }, []);

  // Añadir un cleanup effect para los intervalos
  useEffect(() => {
    return () => {
      Object.values(intervalsRef.current).forEach(interval => {
        if (interval) clearInterval(interval);
      });
    };
  }, []);

  // Modificar el renderizado del Step 1
  const renderStep1 = () => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-xl font-semibold mb-4">Create Story</h2>

      <div className="space-y-6">
        {/* Narrator Section */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Narrator Name
          </label>
          <input
            type="text"
            value={storyData.narrator}
            onChange={(e) => setStoryData(prev => ({
              ...prev,
              narrator: e.target.value
            }))}
            placeholder="Enter narrator name..."
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 border-gray-300"
          />
        </div>

        {/* Add Participants Section */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              User 1 Name
            </label>
            <input
              type="text"
              value={storyData.participants.user1}
              onChange={(e) => setStoryData(prev => ({
                ...prev,
                participants: {
                  ...prev.participants,
                  user1: e.target.value
                }
              }))}
              placeholder="Enter user 1 name..."
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 border-gray-300"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              User 2 Name
            </label>
            <input
              type="text"
              value={storyData.participants.user2}
              onChange={(e) => setStoryData(prev => ({
                ...prev,
                participants: {
                  ...prev.participants,
                  user2: e.target.value
                }
              }))}
              placeholder="Enter user 2 name..."
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 border-gray-300"
            />
          </div>
        </div>

        {/* Story Interface */}
        <div className="border rounded-lg h-[500px] flex flex-col">
          {/* Story Segments Area */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-gray-50">
            {storyData.segments.map((segment, index) => (
              <div key={index} className="bg-white rounded-lg p-4 border border-gray-200">
                <p className="text-gray-800">{segment.content}</p>
                <div className="text-xs mt-2 text-gray-500">{segment.timestamp}</div>
              </div>
            ))}
          </div>

          {/* Segment Input Area */}
          <div className="border-t p-4 bg-white">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newSegment.trim()) return;

                const newSegmentObj = {
                  content: newSegment,
                  timestamp: new Date().toLocaleTimeString()
                };

                setStoryData(prev => ({
                  ...prev,
                  segments: [...prev.segments, newSegmentObj]
                }));
                setNewSegment('');
              }}
              className="flex gap-2"
            >
              <div className="flex-1">
                <textarea
                  value={newSegment}
                  onChange={(e) => setNewSegment(e.target.value)}
                  placeholder="Write your story segment..."
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 border-gray-300 resize-none"
                  rows={3}
                />
              </div>
              <button
                type="submit"
                disabled={!newSegment.trim()}
                className="self-end bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
              >
                Add Segment
              </button>
            </form>
          </div>
        </div>

        {/* Continue Button */}
        <div className="border-t pt-6">
          <button
            onClick={() => {
              if (!storyData.narrator) {
                alert('Please enter narrator name');
                return;
              }
              if (storyData.segments.length < 1) {
                alert('Please add at least one story segment');
                return;
              }
              setSelectedComments(storyData.segments.map((_, index) => index));
              setCurrentStep(2);
            }}
            className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            disabled={!storyData.narrator || storyData.segments.length < 1}
          >
            Continue
            <ArrowRightIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  // Modify Step 2 voice selection to only show narrator voice
  // In the voice selection section of Step 2:
  const renderVoiceSelection = () => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Narrator Voice
      </label>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {VOICE_OPTIONS.map((voice) => (
            <div key={voice.id} className="relative group">
              <button
                onClick={() => setNarratorVoice(voice.id)}
                className={`h-12 px-3 rounded-lg border flex items-center gap-2 transition-all ${
                  narratorVoice === voice.id
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className="font-medium whitespace-nowrap">{voice.name}</span>
                {narratorVoice === voice.id && (
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                )}
              </button>
              {/* Preview button */}
              <button
                onClick={() => {
                  if (playingVoice === voice.id) {
                    if (audioRef.current) {
                      audioRef.current.pause();
                      audioRef.current = null;
                    }
                    setPlayingVoice(null);
                  } else {
                    generateSpeech("This is a preview of how the narrator voice will sound.", voice.id)
                      .then(url => {
                        if (audioRef.current) {
                          audioRef.current.pause();
                        }
                        const audio = new Audio(url);
                        audioRef.current = audio;
                        audio.play();
                        setPlayingVoice(voice.id);
                        audio.onended = () => {
                          setPlayingVoice(null);
                          audioRef.current = null;
                        };
                      });
                  }
                }}
                className="absolute -right-2 -top-2 w-6 h-6 bg-white rounded-full shadow-md flex items-center justify-center hover:bg-gray-50 border border-gray-200"
              >
                {playingVoice === voice.id ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
                    <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 01.75-.75H9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V5.25zm7 0a.75.75 0 01.75-.75h1.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75h-1.5a.75.75 0 01-.75-.75V5.25z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
                    <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // Modificar el return principal para usar el nuevo Step 1
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

      {/* Step 1: Chat Content */}
      {currentStep === 1 && renderStep1()}

      {/* Step 2: Customize (antes era el paso 3) */}
      {currentStep === 2 && storyData && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold mb-4">Customize Video</h2>
          <div className="flex gap-6">
            {/* Preview lado izquierdo */}
            <div className="w-1/2">
              <div className="sticky top-4">
                <h3 className="font-medium mb-4">Preview</h3>
                <div className="relative aspect-[9/16] bg-black rounded-lg overflow-hidden">
                  {/* Frame de fondo */}
                  {previewFrames.length > 0 && currentMessageIndex >= 0 && (
                    <img
                      src={previewFrames[currentMessageIndex]}
                      className="absolute inset-0 w-full h-full object-cover"
                      alt={`Preview frame ${currentMessageIndex + 1}`}
                    />
                  )}

                  {/* Canvas para los mensajes */}
                  <canvas
                    ref={canvasRef}
                    className="absolute inset-0 w-full h-full"
                    width={1080}
                    height={1920}
                  />

                  {/* Flechas de navegación */}
                  <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-between px-4 pointer-events-none">
                    {/* Flecha izquierda */}
                    <button
                      onClick={() => setCurrentMessageIndex(prev => Math.max(0, prev - 1))}
                      className="w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/75 transition-colors pointer-events-auto"
                      disabled={currentMessageIndex <= 0}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                      </svg>
                    </button>

                    {/* Flecha derecha */}
                    <button
                      onClick={() => setCurrentMessageIndex(prev => Math.min(storyData.segments.length - 1, prev + 1))}
                      className="w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/75 transition-colors pointer-events-auto"
                      disabled={currentMessageIndex >= storyData.segments.length - 1}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    </button>
                  </div>

                  {/* Indicador de mensaje actual */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 p-4">
                    <div className="text-white text-sm text-center font-medium">
                      Message {currentMessageIndex + 1} of {storyData.segments.length}
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
                      Voices
                    </label>
                    <div className="space-y-4">
                      {/* Voz para User 1 */}
                      <div>
                        <label className="text-sm text-gray-600 mb-2 block">
                          Voice for {storyData.participants.user1}
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {VOICE_OPTIONS.map((voice) => (
                            <div key={voice.id} className="relative group">
                              <button
                                onClick={() => setUserVoices(prev => ({ ...prev, user1: voice.id }))}
                                className={`h-12 px-3 rounded-lg border flex items-center gap-2 transition-all ${
                                  userVoices.user1 === voice.id
                                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                                    : 'border-gray-200 hover:border-gray-300'
                                }`}
                              >
                                <span className="font-medium whitespace-nowrap">{voice.name}</span>
                                {userVoices.user1 === voice.id && (
                                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                                )}
                              </button>
                              {/* Preview button */}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Voz para User 2 */}
                      <div>
                        <label className="text-sm text-gray-600 mb-2 block">
                          Voice for {storyData.participants.user2}
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {VOICE_OPTIONS.map((voice) => (
                            <div key={voice.id} className="relative group">
                              <button
                                onClick={() => setUserVoices(prev => ({ ...prev, user2: voice.id }))}
                                className={`h-12 px-3 rounded-lg border flex items-center gap-2 transition-all ${
                                  userVoices.user2 === voice.id
                                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                                    : 'border-gray-200 hover:border-gray-300'
                                }`}
                              >
                                <span className="font-medium whitespace-nowrap">{voice.name}</span>
                                {userVoices.user2 === voice.id && (
                                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                                )}
                              </button>
                              {/* Preview button */}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Background Video
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {VIDEO_OPTIONS.map((video) => (
                        <button
                          key={video.id}
                          onClick={() => setSelectedVideo(video.id)}
                          className={`relative h-24 rounded-lg border overflow-hidden group ${
                            selectedVideo === video.id
                              ? 'border-blue-500 ring-2 ring-blue-500/20'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          {/* Video preview */}
                          <video
                            src={video.src}
                            className="absolute inset-0 w-full h-full object-cover"
                            muted
                            loop
                            playsInline
                            onMouseEnter={(e) => e.currentTarget.play()}
                            onMouseLeave={(e) => e.currentTarget.pause()}
                          />
                          {/* Overlay con el nombre */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-black/0 flex items-end p-2">
                            <span className="text-white text-sm font-medium">{video.name}</span>
                          </div>
                          {/* Indicador de selección */}
                          {selectedVideo === video.id && (
                            <div className="absolute top-2 right-2 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" className="w-3 h-3">
                                <path fillRule="evenodd" d="M19.916 4.626a.75.75 0 01.208 1.04l-9 13.5a.75.75 0 01-1.154.114l-6-6a.75.75 0 011.06-1.06l5.353 5.353 8.493-12.739a.75.75 0 011.04-.208z" clipRule="evenodd" />
                              </svg>
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Background Music
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {MUSIC_OPTIONS.map((music) => (
                        <button
                          key={music.id}
                          onClick={() => setSelectedMusic(music.id)}
                          className={`relative h-12 rounded-lg border group flex items-center px-4 ${
                            selectedMusic === music.id
                              ? 'border-blue-500 ring-2 ring-blue-500/20'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex-1">
                            <span className="text-sm font-medium">{music.name}</span>
                          </div>

                          {/* Botón de reproducción */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();

                              // Si hay música reproduciéndose, detenerla
                              if (musicPreviewRef.current) {
                                musicPreviewRef.current.pause();
                                musicPreviewRef.current = null;
                                setPlayingMusic(null);
                                return;
                              }

                              // Si es la misma música, detenerla
                              if (playingMusic === music.id) {
                                setPlayingMusic(null);
                                return;
                              }

                              // Reproducir la nueva música
                              const audio = new Audio(music.src);
                              musicPreviewRef.current = audio;
                              audio.volume = 0.5;

                              audio.play()
                                .then(() => {
                                  setPlayingMusic(music.id);
                                  // Cuando termine el audio
                                  audio.onended = () => {
                                    setPlayingMusic(null);
                                    musicPreviewRef.current = null;
                                  };
                                })
                                .catch(err => console.log('Error playing music:', err));
                            }}
                            className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center hover:bg-gray-200 transition-colors"
                          >
                            {playingMusic === music.id ? (
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                                <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 01.75-.75H9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V5.25zm7 0a.75.75 0 01.75-.75h1.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75h-1.5a.75.75 0 01-.75-.75V5.25z" clipRule="evenodd" />
                              </svg>
                            ) : (
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                                <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                              </svg>
                            )}
                          </button>

                          {/* Indicador de selección */}
                          {selectedMusic === music.id && (
                            <div className="absolute top-2 right-2 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" className="w-3 h-3">
                                <path fillRule="evenodd" d="M19.916 4.626a.75.75 0 01.208 1.04l-9 13.5a.75.75 0 01-1.154.114l-6-6a.75.75 0 011.06-1.06l5.353 5.353 8.493-12.739a.75.75 0 011.04-.208z" clipRule="evenodd" />
                              </svg>
                            </div>
                          )}
                        </button>
                      ))}
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

              <div className="pt-6 border-t flex">
                <button
                  onClick={() => setCurrentStep(1)}
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

      {/* Step 3: Generate */}
      {currentStep === 3 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="max-w-4xl mx-auto">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="flex items-center justify-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <h2 className="text-2xl font-bold">Video Generated Successfully!</h2>
              </div>
              <p className="text-gray-600">Your chat video is ready to download and share</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Video Preview */}
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Preview</h3>
                  <div className="relative aspect-[9/16] bg-black rounded-lg overflow-hidden shadow-lg">
                    {prerenderedVideo ? (
                      <video
                        key={URL.createObjectURL(prerenderedVideo)} // Añadir key para forzar la recarga
                        src={URL.createObjectURL(prerenderedVideo)}
                        className="absolute inset-0 w-full h-full"
                        controls
                        playsInline
                        controlsList="nodownload"

                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Download Options */}
              <div className="space-y-6">
                {/* Video Info */}
                <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                  <h3 className="text-sm font-medium text-gray-700 mb-4">Video Information</h3>

                  {/* Chat Stats */}
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-white p-4 rounded-lg border border-gray-100">
                      <p className="text-sm text-gray-500 mb-1">Narrator</p>
                      <p className="text-lg font-semibold">
                        {storyData.narrator}
                      </p>
                    </div>
                    <div className="bg-white p-4 rounded-lg border border-gray-100">
                      <p className="text-sm text-gray-500 mb-1">Messages</p>
                      <p className="text-lg font-semibold">{storyData.segments.length}</p>
                    </div>
                    <div className="bg-white p-4 rounded-lg border border-gray-100">
                      <p className="text-sm text-gray-500 mb-1">Duration</p>
                      <p className="text-lg font-semibold">
                        {videoStats.duration
                          ? `${videoStats.duration.toFixed(1)}s`
                          : <span className="text-gray-400">Calculating...</span>
                        }
                      </p>
                    </div>
                    <div className="bg-white p-4 rounded-lg border border-gray-100">
                      <p className="text-sm text-gray-500 mb-1">Resolution</p>
                      <p className="text-lg font-semibold">1080 x 1920</p>
                    </div>
                  </div>

                  {/* Download Buttons */}
                  <div className="space-y-3">
                    <button
                      onClick={handleDownload}
                      disabled={isDownloading || !prerenderedVideo}
                      className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-sm"
                    >
                      {isDownloading ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          {downloadProgress > 0 ? `Downloading ${Math.round(downloadProgress)}%` : 'Processing...'}
                        </>
                      ) : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          Download Video
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => setCurrentStep(2)}
                      className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                      Back to Customize
                    </button>
                  </div>
                </div>

                {/* Share Options */}
                <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                  <h3 className="text-sm font-medium text-gray-700 mb-4">Share</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <button className="flex items-center justify-center gap-2 p-3 bg-[#1DA1F2] text-white rounded-lg hover:bg-[#1a8cd8] transition-colors">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/></svg>
                      Twitter
                    </button>
                    <button className="flex items-center justify-center gap-2 p-3 bg-[#25D366] text-white rounded-lg hover:bg-[#20bd5a] transition-colors">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                      WhatsApp
                    </button>
                    <button className="flex items-center justify-center gap-2 p-3 bg-[#FF0000] text-white rounded-lg hover:bg-[#e50000] transition-colors">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                      YouTube
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
