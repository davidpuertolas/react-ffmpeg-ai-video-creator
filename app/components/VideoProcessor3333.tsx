'use client';

import { useState, useEffect } from 'react';
import { OpenAI } from 'openai';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { TextToImage } from "deepinfra";

interface SubSegment {
  timeStart: number;
  timeEnd: number;
  text: string;
}

interface StorySegment {
  timeStart: number;
  timeEnd: number;
  narration: string;
  visualDescription: string;
  subSegments?: SubSegment[];
  imageUrl?: string;
}

enum ProcessStep {
  PROMPT = 'prompt',
  CONFIG = 'config',
  REVIEW = 'review',
  COMPLETED = 'completed'
}

enum BackgroundMusic {
  NONE = 'none',
  STORYTELLING = 'storytelling',
  TENSE = 'tense'
}

// Simplificar a solo dos opciones: con o sin transición
enum TransitionType {
  NONE = 'none',
  FADE = 'fade'
}

const transitionOptions = [
  {
    value: TransitionType.NONE,
    name: 'Sin transición',
    description: 'Cambio directo entre escenas'
  },
  {
    value: TransitionType.FADE,
    name: 'Fade',
    description: 'Desvanecimiento suave entre escenas'
  }
];

// Actualizar los estilos de subtítulos para incluir ejemplos de texto
const subtitleStyles = [
  {
    name: 'Clásico',
    fontsize: 32,
    fontcolor: 'white',
    borderw: 3,
    bordercolor: 'black',
    shadowcolor: 'black@0.8',
    shadowx: 2,
    shadowy: 2,
    y: '(h-text_h)/2',
    description: 'Subtítulos centrados con borde negro',
    demoText: '¡Hola! Este es un ejemplo'
  },
  {
    name: 'TikTok',
    fontsize: 32,
    fontcolor: 'white',
    borderw: 3,
    bordercolor: 'black',
    shadowcolor: 'black@0.9',
    shadowx: 2,
    shadowy: 2,
    splitColors: true,
    secondLineColor: 'yellow',
    y: '(h-text_h)/2-20',
    description: 'Estilo TikTok con dos colores',
    demoText: ['PRIMERA', 'SEGUNDA LÍNEA']
  }
];

const backgroundMusicOptions = [
  {
    value: BackgroundMusic.NONE,
    name: 'Sin música',
    description: 'Solo narración'
  },
  {
    value: BackgroundMusic.STORYTELLING,
    name: 'Storytelling',
    description: 'Música suave para historias'
  },
  {
    value: BackgroundMusic.TENSE,
    name: 'Tense',
    description: 'Música con tensión dramática'
  }
];

const fadeFilter = (start: number, duration: number = 0.2): string => {
  return `alpha='if(lt(t-${start},${duration}),1*((t-${start})/${duration}),1)'`;
};

// Primero, definir constantes para todas las duraciones
const TRANSITION_DURATION = 0.5;  // Duración de la transición entre segmentos
const FADE_DURATION = 0.2;       // Duración de los fades de subtítulos
const FINAL_EXTENSION = 2;       // Extensión del último segmento
const SUBSCRIBE_TAG_DURATION = 2; // Duración del tag de suscripción
const CLICK_SOUND_OFFSET = 1;    // Cuándo suena el click antes del final
const FADE_IN_DURATION = 0.5; // Duración del fade in en segundos

interface SegmentTiming {
  audioStart: number;
  audioEnd: number;
  videoStart: number;
  videoEnd: number;
  transition: number;
  extraTime: number;
}

const calculateSegmentTiming = (
  audioDuration: number,
  currentTime: number,
  isLastSegment: boolean
): SegmentTiming => {
  const transition = isLastSegment ? 0 : TRANSITION_DURATION;
  const extraTime = isLastSegment ? FINAL_EXTENSION : 0;

  return {
    audioStart: currentTime,
    audioEnd: currentTime + audioDuration,
    videoStart: currentTime,
    videoEnd: currentTime + audioDuration + transition + extraTime,
    transition,
    extraTime
  };
};

interface IntermediateOutputs {
  rawAudio?: string;  // URL for the raw concatenated audio
  backgroundMusic?: string; // URL for the background music mix
  rawVideo?: string;  // URL for the video without audio
  subtitledVideo?: string; // URL for the video with subtitles before final mix
}

// Añadir después de las constantes existentes
const generateImageEffect = (duration: number) =>
  `scale=540:960:force_original_aspect_ratio=increase,crop=540:960,zoompan=z='min(1+(on/${duration*30})*0.15,1.15)':x='if(lt(on,1),iw/2-(iw/zoom/2),max(0,iw/2-(iw/zoom/2)-(on/${duration*30})*100))':y='if(lt(on,1),ih/2-(ih/zoom/2),max(0,ih/2-(ih/zoom/2)-(on/${duration*30})*100))':d=${duration*30}:s=540x960`;

// Añadir esta función de utilidad al inicio del archivo
const estimateSegmentDuration = (text: string): number => {
  const CHARS_PER_SECOND = 15; // Velocidad promedio de narración
  const MIN_DURATION = 3; // Duración mínima en segundos
  const duration = Math.max(text.length / CHARS_PER_SECOND, MIN_DURATION);
  return Math.round(duration * 10) / 10; // Redondear a 1 decimal
};

// Añadir la función generateTextFilter que falta
const generateTextFilter = (text: string, style: typeof subtitleStyles[0], timeStart: number, timeEnd: number) => {
  const fadeInDuration = 0.2;

  // Escapar caracteres especiales de manera más robusta
  const escapeText = (text: string) => {
    return text
      .replace(/[\\]/g, '\\\\')      // Escapar backslashes primero
      .replace(/[']/g, "\\\\'")      // Escapar comillas simples
      .replace(/[:]/g, '\\\\:')      // Escapar dos puntos
      .replace(/[\[]/g, '\\\\[')     // Escapar corchetes
      .replace(/[\]]/g, '\\\\]');    // Escapar corchetes
  };

  if (style.splitColors) {
    const lines = text.split(' ');
    const midpoint = Math.ceil(lines.length / 2);
    const line1 = escapeText(lines.slice(0, midpoint).join(' '));
    const line2 = escapeText(lines.slice(midpoint).join(' '));
    const duration = timeEnd - timeStart;
    const midTime = timeStart + (duration / 2);

    const getAlpha = (t: string) =>
      `if(lt(${t}-${timeStart},${fadeInDuration}),` +
      `(${t}-${timeStart})/${fadeInDuration},1)`;

    return [
      // Primera línea (primera mitad)
      `drawtext=enable='between(t,${timeStart},${midTime})':` +
      `fontfile=mrbeast.ttf:text='${line1}':` +
      `fontsize=${style.fontsize}:fontcolor=yellow@1:` +
      `alpha='${getAlpha('t')}':borderw=${style.borderw}:` +
      `bordercolor=${style.bordercolor}@1:` +
      `shadowcolor=${style.shadowcolor}:shadowx=${style.shadowx}:` +
      `shadowy=${style.shadowy}:x=(w-text_w)/2:y=(h-text_h)/2-30`,

      // Segunda línea (primera mitad)
      `drawtext=enable='between(t,${timeStart},${midTime})':` +
      `fontfile=mrbeast.ttf:text='${line2}':` +
      `fontsize=${style.fontsize}:fontcolor=white@1:` +
      `alpha='${getAlpha('t')}':borderw=${style.borderw}:` +
      `bordercolor=${style.bordercolor}@1:` +
      `shadowcolor=${style.shadowcolor}:shadowx=${style.shadowx}:` +
      `shadowy=${style.shadowy}:x=(w-text_w)/2:y=(h-text_h)/2+30`,

      // Primera línea (segunda mitad)
      `drawtext=enable='between(t,${midTime},${timeEnd})':` +
      `fontfile=mrbeast.ttf:text='${line1}':` +
      `fontsize=${style.fontsize}:fontcolor=white@1:` +
      `alpha='${getAlpha('t')}':borderw=${style.borderw}:` +
      `bordercolor=${style.bordercolor}@1:` +
      `shadowcolor=${style.shadowcolor}:shadowx=${style.shadowx}:` +
      `shadowy=${style.shadowy}:x=(w-text_w)/2:y=(h-text_h)/2-30`,

      // Segunda línea (segunda mitad)
      `drawtext=enable='between(t,${midTime},${timeEnd})':` +
      `fontfile=mrbeast.ttf:text='${line2}':` +
      `fontsize=${style.fontsize}:fontcolor=yellow@1:` +
      `alpha='${getAlpha('t')}':borderw=${style.borderw}:` +
      `bordercolor=${style.bordercolor}@1:` +
      `shadowcolor=${style.shadowcolor}:shadowx=${style.shadowx}:` +
      `shadowy=${style.shadowy}:x=(w-text_w)/2:y=(h-text_h)/2+30`
    ].join(',');
  }

  // Estilo normal con fade in
  return `drawtext=enable='between(t,${timeStart},${timeEnd})':` +
         `fontfile=mrbeast.ttf:text='${escapeText(text)}':` +
         `fontsize=${style.fontsize}:fontcolor=${style.fontcolor}@1:` +
         `alpha='if(lt(t-${timeStart},${fadeInDuration}),` +
         `(t-${timeStart})/${fadeInDuration},1)':borderw=${style.borderw}:` +
         `bordercolor=${style.bordercolor}@1:` +
         `shadowcolor=${style.shadowcolor}:shadowx=${style.shadowx}:` +
         `shadowy=${style.shadowy}:x=(w-text_w)/2:y=${style.y}`;
};

export default function VideoProcessor() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState(0);
  const [storyPrompt, setStoryPrompt] = useState('');
  const [segments, setSegments] = useState<StorySegment[]>([]);
  const [ffmpeg, setFfmpeg] = useState<FFmpeg | null>(null);
  const [resourcesGenerated, setResourcesGenerated] = useState(false);
  const [audioBlobs, setAudioBlobs] = useState<Blob[]>([]);
  const [srtContent, setSrtContent] = useState<string>('');
  const [totalDuration, setTotalDuration] = useState(0);
  const [currentStep, setCurrentStep] = useState<ProcessStep>(ProcessStep.PROMPT);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [finalVideoBlob, setFinalVideoBlob] = useState<Blob | null>(null);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [ffmpegError, setFfmpegError] = useState<string | null>(null);
  const [selectedStyle, setSelectedStyle] = useState(subtitleStyles[0]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState<number | null>(null);
  const [customImagePrompt, setCustomImagePrompt] = useState('');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [includeSubscribeTag, setIncludeSubscribeTag] = useState(false);
  const [selectedMusic, setSelectedMusic] = useState<BackgroundMusic>(BackgroundMusic.NONE);
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);
  const [intermediateOutputs, setIntermediateOutputs] = useState<IntermediateOutputs>({});
  // Add state for transition type
  const [selectedTransition, setSelectedTransition] = useState<TransitionType>(TransitionType.FADE);
  const [isImageEditModalOpen, setIsImageEditModalOpen] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number>(0);

  // Cargar la fuente globalmente
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @font-face {
        font-family: 'The Bold Font';
        src: url('/fonts/mrbeast.ttf') format('truetype');
        font-weight: normal;
        font-style: normal;
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // Añadir los estilos de animación en el useEffect de la fuente
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @font-face {
        font-family: 'The Bold Font';
        src: url('/fonts/mrbeast.ttf') format('truetype');
        font-weight: normal;
        font-style: normal;
      }

      @keyframes fade-in-out {
        0%, 100% { opacity: 0; transform: translateY(10px); }
        20%, 80% { opacity: 1; transform: translateY(0); }
      }

      .animate-fade-in-out {
        animation: fade-in-out 3s infinite;
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // Subtitle Preview Component - Rediseñado para ser más pequeño y profesional
  const SubtitlePreview = () => {
    const style = selectedStyle;
    const previewText = style.splitColors ?
      ['PRIMERA LÍNEA', 'SEGUNDA LÍNEA'] :
      'Preview Subtitle';

    const containerStyle = {
      width: '100%',
      height: '120px',
      backgroundColor: '#1a1a1a',
      display: 'flex',
      flexDirection: 'column' as const,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: '8px',
      overflow: 'hidden',
      position: 'relative' as const,
    };

    const textContainerStyle = {
      position: 'relative' as const,
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      gap: '4px',
    };

    const getTextStyle = (color: string) => ({
      fontSize: `${style.fontsize * 0.8}px`, // Reducido significativamente
      fontWeight: 'normal' as const,
      textAlign: 'center' as const,
      color: color,
      WebkitTextStroke: `${style.borderw/3}px ${style.bordercolor}`,
      textShadow: `
        ${style.shadowx/2}px ${style.shadowy/2}px ${style.shadowcolor},
        ${-style.shadowx/2}px ${style.shadowy/2}px ${style.shadowcolor},
        ${style.shadowx/2}px ${-style.shadowy/2}px ${style.shadowcolor},
        ${-style.shadowx/2}px ${-style.shadowy/2}px ${style.shadowcolor}
      `,
      fontFamily: 'The Bold Font, Arial, sans-serif',
      letterSpacing: '0.5px',
      position: 'relative' as const,
    });

    return (
      <div style={containerStyle}>
        <div style={textContainerStyle}>
          {style.splitColors ? (
            <>
              <div style={getTextStyle('yellow')}>
                {previewText[0]}
              </div>
              <div style={getTextStyle('white')}>
                {previewText[1]}
              </div>
            </>
          ) : (
            <div style={getTextStyle(style.fontcolor)}>
              {previewText}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Modificar el useEffect de inicialización de FFmpeg
  useEffect(() => {
    const loadFFmpeg = async () => {
      try {
        setMessage('Inicializando FFmpeg...');
        console.log('🎬 Iniciando carga de FFmpeg...');

        const ffmpegInstance = new FFmpeg();
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.4/dist/umd';

        console.log('⚙️ Cargando archivos core de FFmpeg...');
        await ffmpegInstance.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });

        console.log('✅ FFmpeg cargado exitosamente');
        setFfmpeg(ffmpegInstance);
        setFfmpegLoaded(true);
        setMessage('FFmpeg inicializado correctamente');
      } catch (error) {
        console.error('❌ Error cargando FFmpeg:', error);
        setFfmpegError(error.message || 'Error inicializando FFmpeg');
        setMessage('Error inicializando el procesador de video');
      }
    };

    loadFFmpeg();

    // Cleanup function
    return () => {
      if (ffmpeg) {
        ffmpeg.terminate();
      }
    };
  }, []);

  const generateStorySegments = async (prompt: string) => {
    try {
      setLoading(true);
      setProgress(0);

      // Iniciar la animación de progreso
      const startTime = Date.now();
      const duration = 25000; // 25 segundos

      const progressInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const currentProgress = Math.min((elapsed / duration) * 95, 95);
        setProgress(currentProgress);

        if (elapsed >= duration) {
          clearInterval(progressInterval);
        }
      }, 100);

      setMessage('Generando historia...');
      console.log('📝 Generando historia con prompt:', prompt);

      const response = await fetch('/api/tiktok-video/generate-story', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
      });

      const story = await response.json();
      console.log('📖 Historia generada:', story);

      if (!story.segments || !Array.isArray(story.segments)) {
        throw new Error('Formato de respuesta inválido');
      }

      // Generar las imágenes para cada segmento en paralelo
      setMessage('Generando imágenes para la historia...');
      const segmentsWithImages = [...story.segments];

      try {
        console.log('🎨 Iniciando generación de imágenes en paralelo...');
        const imagePromises = segmentsWithImages.map((segment, index) => {
          console.log(`📝 Preparando generación de imagen ${index + 1}/${segmentsWithImages.length}`);
          return new Promise<string | null>(async (resolve) => {
            try {
              setMessage(`Generando imagen ${index + 1} de ${segmentsWithImages.length}...`);
              const imageUrl = await generateImageForSegment(segment.visualDescription);
              console.log(`✅ Imagen ${index + 1} generada correctamente`);
              resolve(imageUrl);
            } catch (error) {
              console.error(`❌ Error generando imagen ${index + 1}:`, error);
              resolve(null);
            }
          });
        });

        console.log('⏳ Esperando que todas las imágenes se generen...');
        const imageUrls = await Promise.all(imagePromises);

        const successCount = imageUrls.filter(url => url !== null).length;
        console.log('📊 Resumen de generación de imágenes:', {
          total: imageUrls.length,
          success: successCount,
          failed: imageUrls.length - successCount
        });

        // Limpiar el intervalo cuando se complete
        clearInterval(progressInterval);

        // Actualizar los segmentos con las URLs de las imágenes
        segmentsWithImages.forEach((segment, index) => {
          segment.imageUrl = imageUrls[index] || undefined;
        });

        setSegments(segmentsWithImages);
        setCurrentStep(ProcessStep.CONFIG); // Cambiado de STORY_GENERATED a CONFIG
        setMessage('Historia e imágenes generadas con éxito!');
        setProgress(100);
        return segmentsWithImages;
      } catch (error) {
        clearInterval(progressInterval);
        console.error('❌ Error generando imágenes:', error);
        throw new Error('Error al generar las imágenes: ' + (error.message || 'Error desconocido'));
      }
    } catch (error) {
      console.error('❌ Error generando historia:', error);
      throw new Error('Error al generar la historia: ' + (error.message || 'Error desconocido'));
    } finally {
      setLoading(false);
    }
  };

  const generateAudioForSegment = async (text: string, index: number) => {
    try {
      // Generar el audio de la narración
      const response = await fetch('/api/tiktok-video/generate-speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      });

      // Obtener el audio en blanco
      const blankResponse = await fetch('/songs/blank.mp3');
      if (!blankResponse.ok) {
        throw new Error('No se pudo cargar el audio en blanco');
      }

      // Convertir ambos audios a ArrayBuffer
      const speechBuffer = await response.arrayBuffer();
      const blankBuffer = await blankResponse.arrayBuffer();

      // Combinar los buffers
      const combinedBuffer = new Uint8Array(speechBuffer.byteLength + blankBuffer.byteLength);
      combinedBuffer.set(new Uint8Array(speechBuffer), 0);
      combinedBuffer.set(new Uint8Array(blankBuffer), speechBuffer.byteLength);

      // Crear el blob final
      const blob = new Blob([combinedBuffer], { type: 'audio/mpeg' });
      return blob;
    } catch (error) {
      console.error(`Error generating audio for segment ${index}:`, error);
      throw error;
    }
  };

  const getAudioDuration = async (audioBlob: Blob): Promise<number> => {
    const audioContext = new AudioContext();
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    return audioBuffer.duration;
  };

  const generateSRT = (segments: StorySegment[], timings: SegmentTiming[]) => {
    let srtContent = '';
    let subtitleIndex = 1;

    segments.forEach((segment, index) => {
      if (!segment.subSegments) {
        const timing = timings[index];
        const sentences = segment.narration.split('.').filter(s => s.trim());
        const subSegments: SubSegment[] = [];

        // Usar solo la duración del audio para los subtítulos
        const audioDuration = timing.audioEnd - timing.audioStart;
        let currentTime = timing.audioStart;

        sentences.forEach((sentence) => {
          const words = sentence.trim().split(' ');
          const wordsPerSubSegment = 3;

          // Calcular la duración proporcional basada en la longitud de la frase
          const sentenceDuration = (sentence.length / sentences.reduce((sum, s) => sum + s.length, 0)) * audioDuration;
          const durationPerWord = sentenceDuration / words.length;

          for (let i = 0; i < words.length; i += wordsPerSubSegment) {
            const subSegmentWords = words.slice(i, i + wordsPerSubSegment);
            const timeStart = currentTime;
            const timeEnd = timeStart + (subSegmentWords.length * durationPerWord);

            if (subSegmentWords.length > 0) {
              subSegments.push({
                timeStart,
                timeEnd,
                text: normalizeText(subSegmentWords.join(' '))
              });
            }
            currentTime = timeEnd;
          }
        });

        segment.subSegments = subSegments;
      }

      segment.subSegments.forEach(subSegment => {
        const startTime = formatSRTTime(subSegment.timeStart);
        const endTime = formatSRTTime(subSegment.timeEnd);
        srtContent += `${subtitleIndex}\n${startTime} --> ${endTime}\n${subSegment.text}\n\n`;
        subtitleIndex++;
      });
    });

    return srtContent;
  };

  const formatSRTTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  };

  const downloadFile = (content: string | Blob, filename: string) => {
    const url = content instanceof Blob
      ? URL.createObjectURL(content)
      : URL.createObjectURL(new Blob([content], { type: 'text/plain' }));

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getRandomEffect = (index: number, duration: number) => {
    const effects = [
      // Zoom in desde el centro
      `zoompan=z='min(zoom+0.002,1.2)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`,
      // Zoom out desde el centro
      `zoompan=z='if(eq(on,1),1.2,max(1.2-0.002*on,1))'`,
      // Pan de izquierda a derecha
      `zoompan=z=1.1:x='if(eq(on,1),0,min(iw*0.1,iw*0.1*on/($duration*30)))':y='ih/2-(ih/zoom/2)'`,
      // Pan de arriba a abajo
      `zoompan=z=1.1:x='iw/2-(iw/zoom/2)':y='if(eq(on,1),0,min(ih*0.1,ih*0.1*on/($duration*30)))'`
    ];

    // Reemplazar $duration con la duración real
    return effects[index % effects.length].replace('$duration', duration.toString());
  };

  // Añadir una función de utilidad para limpiar el sistema de archivos
  const cleanupFFmpegFiles = async () => {
    try {
      const files = [
        'input.mp4',
        'output.mp3',
        'final_output.mp4',
        'temp_video.mp4',
        'concat.txt',
        'concat_list.txt',
        'concat_videos.txt',
        'concat_faded.txt',  // Add this
        'mrbeast.ttf',
        'suscribe.gif',
        'click.mp3',
        'background_music.mp3',
        'final_audio.mp3',
        'raw_audio.mp3',
        'mixed_audio.mp3'
      ];

      // También limpiar los archivos de segmentos
      for (let i = 0; i < segments.length; i++) {
        files.push(`image_${i}.jpg`);
        files.push(`segment_${i}.mp3`);
        files.push(`processed_${i}.mp4`);
        files.push(`faded_${i}.mp4`);  // Add this
      }

      for (const file of files) {
        try {
          const exists = await ffmpeg.readFile(file).then(() => true).catch(() => false);
          if (exists) {
            await ffmpeg.deleteFile(file);
          }
        } catch (error) {
          // Ignorar errores de archivos que no existen
        }
      }
    } catch (error) {
      console.error('Error en cleanupFFmpegFiles:', error);
    }
  };

  // Añadir una función para el logging periódico
  const startPeriodicLogging = () => {
    try {
      return setInterval(() => {
        console.log('⚙️ Ejecutando FFmpeg...');
      }, 6000);
    } catch (error) {
      console.error('Error iniciando logging:', error);
      return null;
    }
  };

  // Update the createVideoWithCrossfade function to handle multiple segments properly
  const createVideoWithCrossfade = async () => {
    try {
      console.log(`🎬 Creando video con transición: ${selectedTransition}`);
      console.log(`📊 Número de segmentos: ${segments.length}`);

      // If no transition is selected, just concatenate the videos directly
      if (selectedTransition === TransitionType.NONE) {
        const concatList = segments.map((_, i) => `file 'processed_${i}.mp4'`).join('\n');
        await ffmpeg.writeFile('concat_videos.txt', concatList);

        await ffmpeg.exec([
          '-f', 'concat',
          '-safe', '0',
          '-i', 'concat_videos.txt',
          '-c', 'copy',
          '-y',
          'input.mp4'
        ]);

        console.log('✅ Video sin transiciones generado correctamente');
        return;
      }

      // For fade transitions, we'll use a different approach for multiple segments
      for (let i = 0; i < segments.length; i++) {
        const duration = segments[i].timeEnd - segments[i].timeStart;
        let filters = [];

        // Add fade in for all segments except the first one
        if (i > 0) {
          filters.push(`fade=t=in:st=0:d=${TRANSITION_DURATION}`);
        }

        // Add fade out for all segments except the last one
        if (i < segments.length - 1) {
          const fadeOutStart = Math.max(0, duration - TRANSITION_DURATION);
          filters.push(`fade=t=out:st=${fadeOutStart}:d=${TRANSITION_DURATION}`);
        }

        // Apply filters if we have any
        if (filters.length > 0) {
          await ffmpeg.exec([
            '-i', `processed_${i}.mp4`,
            '-vf', filters.join(','),
            '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p',
            '-preset', 'ultrafast',
            '-y',
            `faded_${i}.mp4`
          ]);
        } else {
          // Just copy the file if no filters
          await ffmpeg.exec([
            '-i', `processed_${i}.mp4`,
            '-c', 'copy',
            '-y',
            `faded_${i}.mp4`
          ]);
        }

        console.log(`🔄 Procesando segmento ${i+1}/${segments.length}:`, {
          duration,
          filters: filters.join(',') || 'ninguno'
        });
      }

      // Now create a concat file with all the faded segments
      const concatList = segments.map((_, i) => `file 'faded_${i}.mp4'`).join('\n');
      await ffmpeg.writeFile('concat_faded.txt', concatList);

      // Concatenate all the faded segments
      await ffmpeg.exec([
        '-f', 'concat',
        '-safe', '0',
        '-i', 'concat_faded.txt',
        '-c', 'copy',
        '-y',
        'input.mp4'
      ]);

      console.log('✅ Video con transiciones generado correctamente');
    } catch (error) {
      console.error('Error creando video con transiciones:', error);
      throw new Error('Error al crear el video con transiciones');
    }
  };

  // Update the generateFinalVideo function to use our new crossfade function
  const generateFinalVideo = async () => {
    // Declarar loggingInterval fuera del try para que sea accesible en el finally
    let loggingInterval: NodeJS.Timeout | null = null;

    try {
      // Limpiar archivos anteriores antes de empezar
      await cleanupFFmpegFiles();

      // Iniciar el logging periódico
      loggingInterval = startPeriodicLogging();

      setLoading(true);
      setCurrentStep(ProcessStep.COMPLETED);

      // Asegurarnos de que ffmpeg está listo
      if (!ffmpeg) {
        throw new Error('FFmpeg no está inicializado');
      }

      let totalVideoDuration = 0;
      let totalAudioDuration = 0;
      const segmentTimings: SegmentTiming[] = [];
      const audioBlobs: Blob[] = [];

      // Primer paso: Calcular todas las duraciones
      for (let i = 0; i < segments.length; i++) {
        const isLastSegment = i === segments.length - 1;

        console.log(`🎵 Procesando audio del segmento ${i + 1}/${segments.length}`);
        const audioBlob = await generateAudioForSegment(segments[i].narration, i);
        const audioDuration = await getAudioDuration(audioBlob);

        const timing = calculateSegmentTiming(audioDuration, totalVideoDuration, isLastSegment);
        segmentTimings.push(timing);

        totalAudioDuration += audioDuration;
        totalVideoDuration = timing.videoEnd;

        segments[i] = {
          ...segments[i],
          timeStart: timing.videoStart,
          timeEnd: timing.videoEnd,
          subSegments: undefined
        };

        console.log(`📊 Segmento ${i + 1}:`, {
          audioDuration,
          videoStart: timing.videoStart,
          videoEnd: timing.videoEnd,
          transition: timing.transition,
          extraTime: timing.extraTime
        });

        audioBlobs.push(audioBlob);
      }

      console.log('⏱️ Duraciones totales:', {
        audio: totalAudioDuration,
        video: totalVideoDuration
      });

      // Generar SRT usando los timings calculados
      const srt = generateSRT(segments, segmentTimings);
      setSrtContent(srt);

      // Pequeña pausa para asegurar que todo está listo
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Step 3: Initialize FFmpeg
      console.log('🎬 Configurando FFmpeg');
      setProgress(40);
      setMessage('Preparando el procesador de video...');

      ffmpeg.on('log', ({ message }) => {
        console.log('📝 FFmpeg log:', message);
        if (message.includes('Error') || message.includes('error')) {
          console.error('❌ FFmpeg error:', message);
          setMessage(`Error en FFmpeg: ${message}`);
        }
      });

      // Step 4: Load and prepare images
      console.log('🖼️ Comenzando procesamiento de imágenes');
      setProgress(45);
      setMessage('Preparando imágenes...');

      try {
        // Descargar y guardar todas las imágenes
        for (let i = 0; i < segments.length; i++) {
          const imageUrl = segments[i].imageUrl;
          if (!imageUrl) {
            throw new Error(`No hay imagen disponible para el segmento ${i + 1}`);
          }

          const imageResponse = await fetch(imageUrl);
          const imageData = await imageResponse.arrayBuffer();
          await ffmpeg.writeFile(`image_${i}.jpg`, new Uint8Array(imageData));

          // Procesar cada imagen individualmente
          const duration = segments[i].timeEnd - segments[i].timeStart;

          // Generar video para cada imagen con el efecto
          await ffmpeg.exec([
            '-i', `image_${i}.jpg`,
            '-vf', `fps=30,${generateImageEffect(duration)}`,
            '-t', duration.toString(),
            '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p',
            '-preset', 'ultrafast',
            '-y',
            `processed_${i}.mp4`
          ]);
        }

        // Use our createVideoWithCrossfade function instead of the complex filter
        await createVideoWithCrossfade();

        // Verificar que el video se generó correctamente
        const videoCheck = await ffmpeg.readFile('input.mp4');
        if (!videoCheck || videoCheck.length === 0) {
          throw new Error('El video base no se generó correctamente');
        }

      } catch (error) {
        console.error('Error procesando imágenes:', error);
        throw new Error('Error al procesar las imágenes de fondo');
      }

      // Cargar la fuente ANTES de preparar los filtros de texto
      console.log('🎨 Cargando fuente...');
      const fontResponse = await fetch('/fonts/mrbeast.ttf');
      const fontData = await fontResponse.arrayBuffer();
      await ffmpeg.writeFile('mrbeast.ttf', new Uint8Array(fontData));
      console.log('✅ Fuente cargada');

      // Step 5: Process audio files
      setProgress(50);
      setMessage('Procesando archivos de audio...');
      console.log('🔊 Preparando archivos de audio...');

      for (let i = 0; i < audioBlobs.length; i++) {
        const arrayBuffer = await audioBlobs[i].arrayBuffer();
        await ffmpeg.writeFile(`segment_${i}.mp3`, new Uint8Array(arrayBuffer));
        console.log(`✓ Audio ${i + 1} preparado`);
      }

      // Create concat file and merge audio
      console.log('🔄 Combinando archivos de audio...');
      const concatFile = audioBlobs.map((_, i) => `file 'segment_${i}.mp3'`).join('\n');
      await ffmpeg.writeFile('concat.txt', concatFile);

      setMessage('Combinando archivos de audio...');
      await ffmpeg.exec([
        '-f', 'concat',
        '-safe', '0',
        '-i', 'concat.txt',
        '-c', 'copy',
        'raw_audio.mp3'
      ]);
      console.log('✅ Audio combinado correctamente');

      // Pequeña pausa para asegurar que el audio está listo
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Step 6: Prepare text filters
      setProgress(60);
      setMessage('Preparando efectos de texto...');
      console.log('✍️ Generando filtros de texto para subtítulos...');

      // Asegurarnos de que estamos usando los segmentos actualizados con subSegments
      const textFilters = segments.flatMap(segment =>
        segment.subSegments?.map(subSegment => {
          const escapedText = subSegment.text
            .replace(/'/g, "'\\''") // Escapar comillas simples
            .replace(/:/g, "\\:") // Escapar dos puntos
            .replace(/\[/g, "\\[") // Escapar corchetes
            .replace(/\]/g, "\\]"); // Escapar corchetes

          return generateTextFilter(escapedText, selectedStyle, subSegment.timeStart, subSegment.timeEnd);
        }) || []
      ).join(',');

      // Asegurarnos de que hay filtros de texto
      const finalFilter = textFilters || 'null';
      console.log('Filtros configurados:', finalFilter);

      console.log('✅ Filtros de texto preparados');

      // Después de combinar los audios pero antes de la generación final del video
      if (selectedMusic !== BackgroundMusic.NONE) {
        setMessage('Añadiendo música de fondo...');

        // Cargar el archivo de música seleccionado
        const musicFile = selectedMusic === BackgroundMusic.STORYTELLING
          ? '/songs/storytelling.mp3'
          : '/songs/tense.mp3';

        // Añadir verificación de existencia de archivos
        try {
          // Verificar si el archivo de música existe
          const checkResponse = await fetch(musicFile, { method: 'HEAD' });
          if (!checkResponse.ok) {
            addLog(`ADVERTENCIA: El archivo de música ${musicFile} no está disponible. Continuando sin música.`);
            // Si no hay música, simplemente renombrar
        await ffmpeg.exec([
              '-i', 'subtitled_video.mp4',
              '-c', 'copy',
              'final_video.mp4'
            ]);
          } else {
            // Descargar música de fondo
            const musicResponse = await fetch(musicFile);
            const musicData = await musicResponse.arrayBuffer();
            ffmpeg.writeFile('background.mp3', new Uint8Array(musicData));
            addLog(`Música de fondo descargada y guardada (${musicData.byteLength} bytes)`);

            // Mezclar audio
            const musicCommand = [
              '-i', 'temp_video.mp4',
              '-i', 'background.mp3',
              '-filter_complex',
              // Asegurar que la música se corte cuando termine el video
              '[1:a]aloop=loop=-1:size=2s[music];[music]volume=0.2[musicfaded];[0:a][musicfaded]amix=inputs=2:duration=first[a]',
              '-map', '0:v',
              '-map', '[a]',
              '-c:v', 'copy',
              '-c:a', 'aac',
              'final_video.mp4'
            ];

            addLog(`Ejecutando comando de mezcla de audio:\n${musicCommand.join(' ')}`);
            await ffmpeg.exec(musicCommand);
            addLog('Música de fondo añadida correctamente');
          }
        } catch (error) {
          addLog(`ERROR añadiendo música: ${error}. Continuando sin música.`);
          // Si hay error, continuar sin música
        await ffmpeg.exec([
            '-i', 'subtitled_video.mp4',
          '-c', 'copy',
            'final_video.mp4'
          ]);
        }
      } else {
        // Si no hay música, simplemente renombrar
        addLog('No se seleccionó música de fondo, copiando video con subtítulos como final');
        await ffmpeg.exec([
          '-i', 'subtitled_video.mp4',
          '-c', 'copy',
          'final_video.mp4'
        ]);
      }

      // Añadir tag de suscripción si está seleccionado
      if (includeSubscribeTag) {
        setMessage('Añadiendo animación de suscripción...');
        setProgress(90);

        addLog('Añadiendo tag de suscripción...');

        try {
          // Cargar el sonido de click
          const clickResponse = await fetch('/tags/click.mp3');
          if (!clickResponse.ok) {
            throw new Error('No se pudo cargar el sonido de click');
          }
          const clickData = await clickResponse.arrayBuffer();
          await ffmpeg.writeFile('click.mp3', new Uint8Array(clickData));
          addLog('Sonido de click cargado');

          // Cargar el gif de suscripción
          const tagResponse = await fetch('/tags/suscribe.gif');
          if (!tagResponse.ok) {
            throw new Error('No se pudo cargar el gif de suscripción');
          }
          const tagData = await tagResponse.arrayBuffer();
          await ffmpeg.writeFile('suscribe.gif', new Uint8Array(tagData));
          addLog('GIF de suscripción cargado');

          // Obtener duración del video
          const { duration } = await getVideoDuration('final_video.mp4');
          const tagStart = duration - SUBSCRIBE_TAG_DURATION;
          const clickTime = duration - CLICK_SOUND_OFFSET;

          // Aplicar tag y sonido
          await ffmpeg.exec([
            '-i', 'final_video.mp4',
            '-ignore_loop', '0',
            '-i', 'suscribe.gif',
            '-i', 'click.mp3',
            '-filter_complex',
            `[1:v]scale=300:-1[tag];` +
            `[0:v][tag]overlay=W-w-20:H-h-20:enable='between(t,${tagStart},${duration})'[v];` +
            `[2:a]adelay=${Math.round(clickTime*1000)}|${Math.round(clickTime*1000)},volume=0.5[click];` +
            `[0:a][click]amix=inputs=2:duration=first[a]`,
            '-map', '[v]',
            '-map', '[a]',
            '-t', duration.toString(),
            'output.mp4'
          ]);

          addLog('Tag de suscripción y sonido añadidos correctamente');
        } catch (error) {
          addLog(`ERROR con el tag de suscripción: ${error}. Continuando sin tag.`);
          // Si hay error, continuar sin tag
          await ffmpeg.exec([
            '-i', 'final_video.mp4',
            '-c', 'copy',
            'output.mp4'
          ]);
        }
      } else {
        // Si no hay tag, simplemente renombrar
        addLog('No se seleccionó tag de suscripción, copiando video final como output');
        await ffmpeg.exec([
          '-i', 'final_video.mp4',
          '-c', 'copy',
          'output.mp4'
        ]);
      }

      // Leer el archivo final
      setMessage('Finalizando video...');
      setProgress(98);

      addLog('Leyendo archivo de video final...');
      const data = await ffmpeg.readFile('output.mp4');
      addLog(`Archivo de video final leído (${data.byteLength} bytes)`);

      const finalVideoBlob = new Blob([data], { type: 'video/mp4' });
      const videoUrl = URL.createObjectURL(finalVideoBlob);

      setGeneratedVideoUrl(videoUrl);
      setFinalVideoBlob(finalVideoBlob);
      setMessage('¡Video generado con éxito!');
      setProgress(100);

      addLog('¡PROCESO COMPLETADO CON ÉXITO!');
      addLog(`Tamaño del video final: ${(finalVideoBlob.size / (1024 * 1024)).toFixed(2)} MB`);

      // Crear URLs para los outputs intermedios
      try {
        // Audio raw
        const rawAudioData = await ffmpeg.readFile('audio_0.mp3');
        const rawAudioUrl = URL.createObjectURL(new Blob([rawAudioData], { type: 'audio/mp3' }));
        setIntermediateOutputs(prev => ({ ...prev, rawAudio: rawAudioUrl }));

        // Video con subtítulos
        const subtitledVideoData = await ffmpeg.readFile('temp_video.mp4');
        const subtitledVideoUrl = URL.createObjectURL(new Blob([subtitledVideoData], { type: 'video/mp4' }));
        setIntermediateOutputs(prev => ({ ...prev, subtitledVideo: subtitledVideoUrl }));

        // Video raw
        const rawVideoData = await ffmpeg.readFile('input.mp4');
        const rawVideoUrl = URL.createObjectURL(new Blob([rawVideoData], { type: 'video/mp4' }));
        setIntermediateOutputs(prev => ({ ...prev, rawVideo: rawVideoUrl }));

        addLog('URLs de outputs intermedios creadas correctamente');
      } catch (error) {
        addLog(`ADVERTENCIA: No se pudieron crear algunas URLs intermedias: ${error}`);
      }

    } catch (error) {
      console.error('Error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      setMessage(`Error: ${errorMessage}`);
      setFfmpegError(errorMessage);

      // Añadir al log
      const logContainer = document.getElementById('ffmpeg-logs');
      if (logContainer) {
        const logLine = document.createElement('div');
        logLine.style.color = '#ff0000';
        logLine.textContent = `[${new Date().toLocaleTimeString()}] ERROR FATAL: ${errorMessage}`;
        logContainer.appendChild(logLine);
        logContainer.scrollTop = logContainer.scrollHeight;
      }
    } finally {
      setLoading(false);
    }
  };

  // Función separada para agregar el tag de suscripción
  const addSubscribeTag = async (totalDuration: number) => {
    try {
      await ffmpeg.exec(['-i', 'final_output.mp4', '-c', 'copy', 'temp_video.mp4']);

      // Cargar recursos
      await Promise.all([
        loadResource('suscribe.gif', '/tags/suscribe.gif'),
        loadResource('click.mp3', '/tags/click.mp3')
      ]);

      const tagStart = totalDuration - SUBSCRIBE_TAG_DURATION;
      const clickTime = totalDuration - CLICK_SOUND_OFFSET;

      await ffmpeg.exec([
        '-i', 'temp_video.mp4',
        '-ignore_loop', '0',
        '-i', 'suscribe.gif',
        '-i', 'click.mp3',
        '-filter_complex',
        `[1:v]scale=525:930,setpts=PTS-STARTPTS+${tagStart}/TB[gif];` +
        `[0:v][gif]overlay=(W-w)/2:(H-h)/15:enable='between(t,${tagStart},${totalDuration})'[v];` +
        `[2:a]adelay=${clickTime*1000}|${clickTime*1000},volume=0.3[click];` +
        `[0:a][click]amix=inputs=2:duration=first[a]`,
        '-map', '[v]',
        '-map', '[a]',
        '-t', totalDuration.toString(),
        '-y',
        'final_output_with_subscribe.mp4'
      ]);

      await ffmpeg.exec([
        '-i', 'final_output_with_subscribe.mp4',
        '-c', 'copy',
        '-y',
        'final_output.mp4'
      ]);
    } catch (error) {
      console.error('❌ Error agregando tag de suscripción:', error);
      throw error;
    }
  };

  // Función auxiliar para cargar recursos
  const loadResource = async (filename: string, url: string) => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`No se pudo cargar ${filename}. Status: ${response.status}`);
    }
    const data = await response.arrayBuffer();
    await ffmpeg.writeFile(filename, new Uint8Array(data));
  };

  const normalizeText = (str: string) => {
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Elimina diacríticos
      .toUpperCase()                   // Convierte a mayúsculas
      //.replace(/ñ/g, 'ñ')              // Reemplaza ñ por n
      //.replace(/Ñ/g, 'Ñ');             // Reemplaza Ñ por N
  };

  const updateSegmentNarration = (index: number, newNarration: string) => {
    const updatedSegments = [...segments];
    updatedSegments[index] = {
      ...updatedSegments[index],
      narration: newNarration
    };
    setSegments(updatedSegments);
  };

  // Rediseño del StepIndicator para hacerlo más moderno
  const StepIndicator = ({ step, currentStep, title }: {
    step: ProcessStep,
    currentStep: ProcessStep,
    title: string
  }) => {
    const isActive = currentStep === step;
    const isCompleted = getStepNumber(currentStep) > getStepNumber(step);

    return (
      <div className={`flex flex-col items-center ${isCompleted ? 'text-green-600' : isActive ? 'text-blue-600' : 'text-gray-400'}`}>
        <div className={`
          flex items-center justify-center w-8 h-8 rounded-full border-2 mb-1
          ${isCompleted ? 'bg-green-100 border-green-600' :
            isActive ? 'bg-blue-100 border-blue-600' :
            'bg-gray-100 border-gray-400'}
        `}>
          {isCompleted ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
            </svg>
          ) : (
            <span className="text-sm">{getStepNumber(step)}</span>
          )}
        </div>
        <span className="text-xs font-medium text-center hidden md:block">{title}</span>
      </div>
    );
  };

  const getStepNumber = (step: ProcessStep): number => {
    const steps = [
      ProcessStep.PROMPT,
      ProcessStep.CONFIG,
      ProcessStep.REVIEW,
      ProcessStep.COMPLETED
    ];
    return steps.indexOf(step) + 1;
  };

  // Rediseño del StepStatus para hacerlo más atractivo
  const StepStatus = ({ completed, current, title, description }: {
    completed: boolean;
    current: boolean;
    title: string;
    description: string;
  }) => (
    <div className="flex items-start space-x-3">
      <div className={`flex-shrink-0 h-5 w-5 relative mt-1 ${
        completed ? 'text-green-600' :
        current ? 'text-blue-600' : 'text-gray-300'
      }`}>
        {completed ? (
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : current ? (
          <div className="animate-pulse">
            <div className="h-2 w-2 bg-blue-600 rounded-full absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"></div>
          </div>
        ) : (
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 12h.01M12 12h.01M12 12h.01" />
          </svg>
        )}
      </div>
      <div>
        <p className={`text-sm font-medium ${
          completed ? 'text-green-800' :
          current ? 'text-blue-800' : 'text-gray-500'
        }`}>
          {title}
        </p>
        <p className={`text-xs ${
          completed ? 'text-green-600' :
          current ? 'text-blue-600' : 'text-gray-400'
        }`}>
          {description}
        </p>
      </div>
    </div>
  );

  const generateImageForSegment = async (visualDescription: string): Promise<string> => {
    try {
      console.log('🎨 Iniciando generación de imagen para:', visualDescription.substring(0, 50) + '...');

      const response = await fetch('/api/tiktok-video/generate-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: visualDescription }),
      });

      if (!response.ok) {
        throw new Error(`Error en la generación de imagen (status ${response.status}): ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.imageUrl) {
        throw new Error('No se recibió URL de imagen en la respuesta');
      }

      // Verificar que la imagen es accesible
      const imageResponse = await fetch(data.imageUrl);
      if (!imageResponse.ok) {
        throw new Error(`La imagen generada no es accesible (status ${imageResponse.status})`);
      }

      console.log('✅ Imagen generada exitosamente:', {
        prompt: visualDescription.substring(0, 50) + '...',
        url: data.imageUrl.substring(0, 50) + '...'
      });

      return data.imageUrl;
    } catch (error) {
      console.error('❌ Error generando imagen:', {
        error,
        prompt: visualDescription.substring(0, 50) + '...'
      });
      throw error;
    }
  };

  // Botón de generar historia mejorado
  const renderGenerateStoryButton = () => (
    <div className="space-y-4">
        <button
        onClick={() => generateStorySegments(storyPrompt)}
        disabled={loading || !storyPrompt}
        className="w-full py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
      >
        {loading ? (
          <span className="flex items-center justify-center">
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Generando...
          </span>
        ) : (
          <span className="flex items-center justify-center">
            <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Generar Historia
          </span>
        )}
        </button>

      {loading && (
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">{message}</span>
            <span className="text-sm font-medium text-blue-600">{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-gradient-to-r from-blue-500 to-indigo-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      )}
    </div>
  );

  // Mejorar el modal de edición de imagen con una vista previa del dispositivo
  const ImageEditModal = ({ isOpen, onClose, segmentIndex }: {
    isOpen: boolean;
    onClose: () => void;
    segmentIndex: number;
  }) => {
    if (!isOpen) return null;

    const segment = segments[segmentIndex];
    const [prompt, setPrompt] = useState(segment.visualDescription);

    const handleRegenerateImage = async () => {
      try {
        setMessage('Generando nueva imagen...');
        const response = await fetch('/api/tiktok-video/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt })
        });

        if (!response.ok) throw new Error('Error al generar la imagen');
        const data = await response.json();

        const updatedSegments = [...segments];
        updatedSegments[segmentIndex] = {
          ...updatedSegments[segmentIndex],
          imageUrl: data.imageUrl,
          visualDescription: prompt
        };
        setSegments(updatedSegments);
        onClose();
      } catch (error) {
        console.error('Error:', error);
        setMessage('Error al generar la imagen');
      }
    };

      return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg w-full max-w-md">
          <div className="p-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Regenerar imagen {segmentIndex + 1}
            </h3>

            {/* Vista previa en dispositivo */}
            <div className="relative mx-auto w-40 mb-4">
              {/* Marco del teléfono */}
              <div className="absolute inset-0 w-full h-full bg-gray-800 rounded-xl shadow-lg" style={{ padding: '8px 4px' }}>
                {/* Pantalla */}
                <div className="relative w-full h-full bg-gray-900 rounded-lg overflow-hidden">
                  {segment.imageUrl ? (
                    <img
                      src={segment.imageUrl}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="animate-spin h-6 w-6 border-b-2 border-blue-600"></div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 mb-4"
              rows={3}
              placeholder="Describe la imagen que quieres generar..."
            />
            <div className="flex justify-end gap-2">
          <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
                Cancelar
          </button>
      <button
                onClick={handleRegenerateImage}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
      >
                Regenerar
      </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Actualizar la función generateVideo para mostrar logs detallados
  const generateVideo = async () => {
    if (!ffmpegLoaded) return;

    try {
      // Crear un div para los logs
      const logContainer = document.createElement('div');
      logContainer.id = 'ffmpeg-logs';
      logContainer.style.cssText = 'position: fixed; bottom: 80px; left: 20px; right: 20px; max-height: 200px; overflow-y: auto; background: rgba(0,0,0,0.8); color: #00ff00; font-family: monospace; font-size: 12px; padding: 10px; border-radius: 5px; z-index: 9999;';
      document.body.appendChild(logContainer);

      const addLog = (text: string) => {
        const logLine = document.createElement('div');
        logLine.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
        logContainer.appendChild(logLine);
        logContainer.scrollTop = logContainer.scrollHeight;
        console.log(text);
      };

      setLoading(true);
      setCurrentStep(ProcessStep.COMPLETED);
      setMessage('Preparando recursos...');
      setProgress(5);

      addLog('Iniciando generación de video...');

      // Calcular duraciones y tiempos
      let totalVideoDuration = 0;
      let totalAudioDuration = 0;
      const segmentTimings: SegmentTiming[] = [];

      // Generar audio para cada segmento
      addLog(`Generando audio para ${segments.length} segmentos...`);
      const audioPromises = segments.map(async (segment, index) => {
        setMessage(`Generando audio para segmento ${index + 1}/${segments.length}...`);
        setProgress(5 + (index / segments.length) * 20);

        addLog(`Generando audio para segmento ${index + 1}: "${segment.narration.substring(0, 30)}..."`);

        const response = await fetch('/api/tiktok-video/generate-speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: segment.narration })
        });

        if (!response.ok) {
          const errorText = await response.text();
          addLog(`Error generando audio: ${errorText}`);
          throw new Error(`Error generando audio: ${errorText}`);
        }

        addLog(`Audio generado para segmento ${index + 1}`);
        const audioBlob = await response.blob();
        return audioBlob;
      });

      const audioResults = await Promise.all(audioPromises);
      setAudioBlobs(audioResults);
      addLog(`Todos los audios generados correctamente (${audioResults.length} segmentos)`);

      // Calcular duraciones y tiempos para cada segmento
      addLog('Calculando duraciones y tiempos...');
      for (let i = 0; i < segments.length; i++) {
        const isLastSegment = i === segments.length - 1;
        const audioDuration = await getAudioDuration(audioResults[i]);

        const timing = calculateSegmentTiming(audioDuration, totalVideoDuration, isLastSegment);
        segmentTimings.push(timing);

        totalAudioDuration += audioDuration;
        totalVideoDuration = timing.videoEnd;

        segments[i] = {
          ...segments[i],
          timeStart: timing.videoStart,
          timeEnd: timing.videoEnd,
          subSegments: undefined
        };

        addLog(`Segmento ${i + 1}: duración=${audioDuration.toFixed(2)}s, inicio=${timing.videoStart.toFixed(2)}s, fin=${timing.videoEnd.toFixed(2)}s`);
      }

      addLog(`Duración total de audio: ${totalAudioDuration.toFixed(2)}s`);
      addLog(`Duración total de video: ${totalVideoDuration.toFixed(2)}s`);

      // Generar SRT para subtítulos
      addLog('Generando subtítulos...');
      const srt = generateSRT(segments, segmentTimings);
      setSrtContent(srt);
      addLog(`Subtítulos generados: ${srt.split('\n\n').length} entradas`);

      // Procesar video con FFmpeg
      setMessage('Inicializando FFmpeg...');
      setProgress(30);

      if (!ffmpeg) {
        addLog('ERROR: FFmpeg no está inicializado');
        throw new Error('FFmpeg no está inicializado');
      }

      // Configurar FFmpeg para mostrar logs
      ffmpeg.on('log', ({ message }) => {
        addLog(`FFmpeg: ${message}`);
      });

      // Escribir archivos de audio e imágenes al sistema de archivos virtual
      setMessage('Preparando archivos de audio e imágenes...');
      setProgress(35);

      for (let i = 0; i < segments.length; i++) {
        // Escribir audio
        addLog(`Procesando audio ${i + 1}/${segments.length}...`);
        const audioData = await audioResults[i].arrayBuffer();
        ffmpeg.writeFile(`audio_${i}.mp3`, new Uint8Array(audioData));
        addLog(`Audio ${i + 1} escrito en el sistema de archivos virtual (${audioData.byteLength} bytes)`);

        // Descargar y escribir imagen
        if (segments[i].imageUrl) {
          setMessage(`Procesando imagen ${i + 1}/${segments.length}...`);
          addLog(`Descargando imagen para segmento ${i + 1}: ${segments[i].imageUrl.substring(0, 50)}...`);

          const imgResponse = await fetch(segments[i].imageUrl);
          if (!imgResponse.ok) {
            addLog(`ERROR: No se pudo descargar la imagen para el segmento ${i + 1}`);
            throw new Error(`Error al descargar imagen para segmento ${i + 1}`);
          }

          const imgData = await imgResponse.arrayBuffer();
          ffmpeg.writeFile(`image_${i}.jpg`, new Uint8Array(imgData));
          addLog(`Imagen ${i + 1} escrita en el sistema de archivos virtual (${imgData.byteLength} bytes)`);
        } else {
          addLog(`ADVERTENCIA: El segmento ${i + 1} no tiene URL de imagen`);
        }
      }

      // Cargar la fuente para los subtítulos
      addLog('Cargando fuente para subtítulos...');
      const fontResponse = await fetch('/fonts/mrbeast.ttf');
      if (!fontResponse.ok) {
        addLog('ADVERTENCIA: No se pudo cargar la fuente mrbeast.ttf, usando fuente por defecto');
      } else {
        const fontData = await fontResponse.arrayBuffer();
        ffmpeg.writeFile('mrbeast.ttf', new Uint8Array(fontData));
        addLog(`Fuente cargada (${fontData.byteLength} bytes)`);
      }

      // Generar segmentos de video con efectos
      setMessage('Generando segmentos de video...');
      setProgress(40);

      for (let i = 0; i < segments.length; i++) {
        setMessage(`Procesando segmento ${i + 1}/${segments.length}...`);
        setProgress(40 + (i / segments.length) * 20);

        const segment = segments[i];
        const duration = segment.timeEnd - segment.timeStart;

        addLog(`Generando video para segmento ${i + 1}/${segments.length} (duración: ${duration.toFixed(2)}s)`);

        // Aplicar efecto de zoom y pan a la imagen
        const command = [
          '-i', `image_${i}.jpg`,
          '-i', `audio_${i}.mp3`,
          '-filter_complex', `[0:v]fps=30,${generateImageEffect(duration)}[v]`,
          '-map', '[v]',
          '-map', '1:a',
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-shortest',
          '-t', duration.toString(),
          '-pix_fmt', 'yuv420p',
          '-preset', 'ultrafast',
          `processed_${i}.mp4`
        ];

        addLog(`Ejecutando comando para segmento ${i + 1}:\n${command.join(' ')}`);
        await ffmpeg.exec(command);
        addLog(`Segmento ${i + 1} procesado correctamente`);
      }

      // Aplicar transiciones entre segmentos
      setMessage('Aplicando transiciones...');
      setProgress(60);

      addLog(`Aplicando transición: ${selectedTransition}`);

      if (selectedTransition === TransitionType.NONE) {
        // Sin transición, simplemente concatenar
        const concatList = segments.map((_, i) => `file 'processed_${i}.mp4'`).join('\n');
        ffmpeg.writeFile('concat_videos.txt', concatList);

        addLog('Concatenando segmentos sin transición...');
        await ffmpeg.exec([
          '-f', 'concat',
          '-safe', '0',
          '-i', 'concat_videos.txt',
          '-c', 'copy',
          'input.mp4'
        ]);
        addLog('Segmentos concatenados correctamente');
      } else {
        // Con transición de fade
        addLog('Aplicando transiciones de fade entre segmentos...');

        for (let i = 0; i < segments.length; i++) {
          const duration = segments[i].timeEnd - segments[i].timeStart;
          let filters = [];

          // Fade in para todos excepto el primero
          if (i > 0) {
            filters.push(`fade=t=in:st=0:d=${TRANSITION_DURATION}`);
          }

          // Fade out para todos excepto el último
          if (i < segments.length - 1) {
            const fadeOutStart = Math.max(0, duration - TRANSITION_DURATION);
            filters.push(`fade=t=out:st=${fadeOutStart}:d=${TRANSITION_DURATION}`);
          }

          addLog(`Aplicando filtros a segmento ${i + 1}: ${filters.join(',') || 'ninguno'}`);

          // Aplicar filtros si hay alguno
          if (filters.length > 0) {
            await ffmpeg.exec([
              '-i', `processed_${i}.mp4`,
              '-vf', filters.join(','),
              '-c:v', 'libx264',
              '-pix_fmt', 'yuv420p',
              '-preset', 'ultrafast',
              `faded_${i}.mp4`
            ]);
          } else {
            // Copiar el archivo si no hay filtros
            await ffmpeg.exec([
              '-i', `processed_${i}.mp4`,
              '-c', 'copy',
              `faded_${i}.mp4`
            ]);
          }

          addLog(`Transición aplicada al segmento ${i + 1}`);
        }

        // Concatenar todos los segmentos con fade
        const concatList = segments.map((_, i) => `file 'faded_${i}.mp4'`).join('\n');
        ffmpeg.writeFile('concat_faded.txt', concatList);

        addLog('Concatenando segmentos con transiciones...');
        await ffmpeg.exec([
          '-f', 'concat',
          '-safe', '0',
          '-i', 'concat_faded.txt',
          '-c', 'copy',
          'input.mp4'
        ]);
        addLog('Segmentos con transiciones concatenados correctamente');
      }

      // Añadir subtítulos
      setMessage('Añadiendo subtítulos...');
      setProgress(70);

      // Escribir archivo SRT
      ffmpeg.writeFile('subtitles.srt', srtContent);
      addLog('Archivo de subtítulos creado');

      // Preparar filtros de texto para los subtítulos
      addLog('Aplicando subtítulos al video...');

      // Generar filtros de texto para cada subsegmento
      const textFilters = segments.flatMap(segment =>
        segment.subSegments?.map(subSegment => {
          const escapedText = subSegment.text
            .replace(/'/g, "'\\''")
            .replace(/:/g, "\\:")
            .replace(/\[/g, "\\[")
            .replace(/\]/g, "\\]");

          return generateTextFilter(escapedText, selectedStyle, subSegment.timeStart, subSegment.timeEnd);
        }) || []
      ).join(',');

      // Asegurarse de que hay filtros de texto
      const finalFilter = textFilters || 'null';
      addLog(`Filtros de texto configurados: ${finalFilter.substring(0, 100)}...`);

      // Aplicar subtítulos con fade in inicial
      await ffmpeg.exec([
        '-i', 'input.mp4',
        '-filter_complex', `fade=t=in:st=0:d=${FADE_IN_DURATION},${finalFilter}[v]`,
        '-map', '[v]',
        '-map', '0:a',
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-shortest',
        '-t', totalVideoDuration.toString(),
        'temp_video.mp4'
      ]);

      addLog('Subtítulos aplicados correctamente');

      // Añadir música de fondo si está seleccionada
      if (selectedMusic !== BackgroundMusic.NONE) {
        setMessage('Añadiendo música de fondo...');
        setProgress(80);

        // Corregir las rutas de los archivos de música
        const musicFile = selectedMusic === BackgroundMusic.STORYTELLING
          ? '/songs/storytelling.mp3'
          : '/songs/tense.mp3';

        addLog(`Añadiendo música de fondo: ${musicFile}`);

        // Verificar si el archivo existe primero
        try {
          const checkResponse = await fetch(musicFile, { method: 'HEAD' });

          if (!checkResponse.ok) {
            addLog(`ADVERTENCIA: El archivo de música ${musicFile} no está disponible. Intentando ruta alternativa...`);

            // Intentar con una ruta alternativa
            const altMusicFile = `/songs/${selectedMusic}.mp3`;
            const altCheckResponse = await fetch(altMusicFile, { method: 'HEAD' });

            if (!altCheckResponse.ok) {
              addLog(`ADVERTENCIA: El archivo de música tampoco está disponible en ${altMusicFile}. Continuando sin música.`);
              // Continuar sin música
              await ffmpeg.exec([
                '-i', 'temp_video.mp4',
                '-c', 'copy',
                'final_video.mp4'
              ]);
            } else {
              // Usar la ruta alternativa
              const musicResponse = await fetch(altMusicFile);
              const musicData = await musicResponse.arrayBuffer();
              ffmpeg.writeFile('background.mp3', new Uint8Array(musicData));
              addLog(`Música de fondo descargada y guardada (${musicData.byteLength} bytes)`);

              // Mezclar audio
              const musicCommand = [
                '-i', 'temp_video.mp4',
                '-i', 'background.mp3',
                '-filter_complex', '[1:a]volume=0.3[music];[0:a][music]amix=inputs=2:duration=longest[a]',
                '-map', '0:v',
                '-map', '[a]',
                '-c:v', 'copy',
                '-c:a', 'aac',
                'final_video.mp4'
              ];

              addLog(`Ejecutando comando de mezcla de audio:\n${musicCommand.join(' ')}`);
              await ffmpeg.exec(musicCommand);
              addLog('Música de fondo añadida correctamente');
            }
          } else {
            // Usar la ruta original
            const musicResponse = await fetch(musicFile);
            const musicData = await musicResponse.arrayBuffer();
            ffmpeg.writeFile('background.mp3', new Uint8Array(musicData));
            addLog(`Música de fondo descargada y guardada (${musicData.byteLength} bytes)`);

            // Mezclar audio
            const musicCommand = [
              '-i', 'temp_video.mp4',
              '-i', 'background.mp3',
              '-filter_complex', '[1:a]volume=0.3[music];[0:a][music]amix=inputs=2:duration=longest[a]',
              '-map', '0:v',
              '-map', '[a]',
              '-c:v', 'copy',
              '-c:a', 'aac',
              'final_video.mp4'
            ];

            addLog(`Ejecutando comando de mezcla de audio:\n${musicCommand.join(' ')}`);
            await ffmpeg.exec(musicCommand);
            addLog('Música de fondo añadida correctamente');
          }
        } catch (error) {
          addLog(`ERROR añadiendo música: ${error}. Continuando sin música.`);
          // Si hay error, continuar sin música
          await ffmpeg.exec([
            '-i', 'temp_video.mp4',
            '-c', 'copy',
            'final_video.mp4'
          ]);
        }
      } else {
        // Si no hay música, simplemente renombrar
        addLog('No se seleccionó música de fondo, copiando video con subtítulos como final');
        await ffmpeg.exec([
          '-i', 'temp_video.mp4',
          '-c', 'copy',
          'final_video.mp4'
        ]);
      }

      // Añadir tag de suscripción si está seleccionado
      if (includeSubscribeTag) {
        setMessage('Añadiendo animación de suscripción...');
        setProgress(90);

        addLog('Añadiendo tag de suscripción...');

        try {
          // Cargar el sonido de click
          const clickResponse = await fetch('/tags/click.mp3');
          if (!clickResponse.ok) {
            throw new Error('No se pudo cargar el sonido de click');
          }
          const clickData = await clickResponse.arrayBuffer();
          await ffmpeg.writeFile('click.mp3', new Uint8Array(clickData));
          addLog('Sonido de click cargado');

          // Cargar el gif de suscripción
          const tagResponse = await fetch('/tags/suscribe.gif');
          if (!tagResponse.ok) {
            throw new Error('No se pudo cargar el gif de suscripción');
          }
          const tagData = await tagResponse.arrayBuffer();
          await ffmpeg.writeFile('suscribe.gif', new Uint8Array(tagData));
          addLog('GIF de suscripción cargado');

          // Obtener duración del video
          const { duration } = await getVideoDuration('final_video.mp4');
          const tagStart = duration - SUBSCRIBE_TAG_DURATION;
          const clickTime = duration - CLICK_SOUND_OFFSET;

          // Aplicar tag y sonido
          await ffmpeg.exec([
            '-i', 'final_video.mp4',
            '-ignore_loop', '0',
            '-i', 'suscribe.gif',
            '-i', 'click.mp3',
            '-filter_complex',
            `[1:v]scale=300:-1[tag];` +
            `[0:v][tag]overlay=W-w-20:H-h-20:enable='between(t,${tagStart},${duration})'[v];` +
            `[2:a]adelay=${Math.round(clickTime*1000)}|${Math.round(clickTime*1000)},volume=0.5[click];` +
            `[0:a][click]amix=inputs=2:duration=first[a]`,
            '-map', '[v]',
            '-map', '[a]',
            '-t', duration.toString(),
            'output.mp4'
          ]);

          addLog('Tag de suscripción y sonido añadidos correctamente');
        } catch (error) {
          addLog(`ERROR con el tag de suscripción: ${error}. Continuando sin tag.`);
          // Si hay error, continuar sin tag
          await ffmpeg.exec([
            '-i', 'final_video.mp4',
            '-c', 'copy',
            'output.mp4'
          ]);
        }
      } else {
        // Si no hay tag, simplemente renombrar
        addLog('No se seleccionó tag de suscripción, copiando video final como output');
        await ffmpeg.exec([
          '-i', 'final_video.mp4',
          '-c', 'copy',
          'output.mp4'
        ]);
      }

      // Leer el archivo final
      setMessage('Finalizando video...');
      setProgress(98);

      addLog('Leyendo archivo de video final...');
      const data = await ffmpeg.readFile('output.mp4');
      addLog(`Archivo de video final leído (${data.byteLength} bytes)`);

      const finalVideoBlob = new Blob([data], { type: 'video/mp4' });
      const videoUrl = URL.createObjectURL(finalVideoBlob);

      setGeneratedVideoUrl(videoUrl);
      setFinalVideoBlob(finalVideoBlob);
      setMessage('¡Video generado con éxito!');
      setProgress(100);

      addLog('¡PROCESO COMPLETADO CON ÉXITO!');
      addLog(`Tamaño del video final: ${(finalVideoBlob.size / (1024 * 1024)).toFixed(2)} MB`);

      // Crear URLs para los outputs intermedios
      try {
        // Audio raw
        const rawAudioData = await ffmpeg.readFile('audio_0.mp3');
        const rawAudioUrl = URL.createObjectURL(new Blob([rawAudioData], { type: 'audio/mp3' }));
        setIntermediateOutputs(prev => ({ ...prev, rawAudio: rawAudioUrl }));

        // Video con subtítulos
        const subtitledVideoData = await ffmpeg.readFile('temp_video.mp4');
        const subtitledVideoUrl = URL.createObjectURL(new Blob([subtitledVideoData], { type: 'video/mp4' }));
        setIntermediateOutputs(prev => ({ ...prev, subtitledVideo: subtitledVideoUrl }));

        // Video raw
        const rawVideoData = await ffmpeg.readFile('input.mp4');
        const rawVideoUrl = URL.createObjectURL(new Blob([rawVideoData], { type: 'video/mp4' }));
        setIntermediateOutputs(prev => ({ ...prev, rawVideo: rawVideoUrl }));

        addLog('URLs de outputs intermedios creadas correctamente');
      } catch (error) {
        addLog(`ADVERTENCIA: No se pudieron crear algunas URLs intermedias: ${error}`);
      }

    } catch (error) {
      console.error('Error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      setMessage(`Error: ${errorMessage}`);
      setFfmpegError(errorMessage);

      // Añadir al log
      const logContainer = document.getElementById('ffmpeg-logs');
      if (logContainer) {
        const logLine = document.createElement('div');
        logLine.style.color = '#ff0000';
        logLine.textContent = `[${new Date().toLocaleTimeString()}] ERROR FATAL: ${errorMessage}`;
        logContainer.appendChild(logLine);
        logContainer.scrollTop = logContainer.scrollHeight;
      }
    } finally {
      setLoading(false);
    }
  };

  // Añadir una pantalla de carga durante la generación
  const LoadingOverlay = () => {
    if (!loading) return null;

    const [showLogs, setShowLogs] = useState(false);

    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <div className="text-center mb-4">
            <div className="w-16 h-16 mx-auto mb-4">
              <svg className="animate-spin w-full h-full text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-1">{message}</h3>
            <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
              <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${progress}%` }}></div>
            </div>
            <p className="text-sm text-gray-500 mb-4">{progress.toFixed(0)}% completado</p>

      <button
              onClick={() => {
                const logsElement = document.getElementById('ffmpeg-logs');
                if (logsElement) {
                  logsElement.style.display = showLogs ? 'none' : 'block';
                  setShowLogs(!showLogs);
                }
              }}
              className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-700"
            >
              {showLogs ? 'Ocultar logs' : 'Mostrar logs'}
      </button>
          </div>
          </div>
        </div>
    );
  };

  // Función para obtener la duración de un video
  const getVideoDuration = async (filename: string) => {
    await ffmpeg.exec([
      '-i', filename,
      '-f', 'null',
      '-'
    ]);

    const output = await ffmpeg.readFile('ffmpeg.log');
    const text = new TextDecoder().decode(output);

    // Extraer duración del log
    const durationMatch = text.match(/Duration: (\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
    if (durationMatch) {
      const hours = parseInt(durationMatch[1]);
      const minutes = parseInt(durationMatch[2]);
      const seconds = parseInt(durationMatch[3]);
      const centiseconds = parseInt(durationMatch[4]);

      return {
        duration: hours * 3600 + minutes * 60 + seconds + centiseconds / 100
      };
    }

    throw new Error('No se pudo determinar la duración del video');
  };

  // Actualizar el renderGenerateVideoButton para usar la función generateVideo
  const renderGenerateVideoButton = () => {
    if (!ffmpegLoaded) {
      return (
        <button
          disabled
          className="w-full py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gray-400 cursor-not-allowed flex items-center justify-center"
        >
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Inicializando FFmpeg...
        </button>
      );
    }

    if (ffmpegError) {
      return (
        <>
          <button
            disabled
            className="w-full py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600"
          >
            Error: {ffmpegError}
          </button>
          <button
            onClick={() => window.location.reload()}
            className="w-full mt-2 py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-all duration-200"
          >
            Reintentar
          </button>
        </>
      );
    }

    return (
      <button
        onClick={generateVideo}
        disabled={loading || segments.length === 0}
        className="w-full py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
      >
        {loading ? (
          <span className="flex items-center justify-center">
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Generando... {progress.toFixed(0)}%
          </span>
        ) : (
          <span className="flex items-center justify-center">
            <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Generar Video
          </span>
        )}
      </button>
    );
  };

  const handleEditImage = (index: number) => {
    setSelectedImageIndex(index);
    setIsImageEditModalOpen(true);
  };

  const handleRegenerateImage = async () => {
    if (selectedSegmentIndex === null) return;

    try {
      setIsRegenerating(true);
      const newImageUrl = await generateImageForSegment(customImagePrompt);

      if (newImageUrl) {
        const updatedSegments = [...segments];
        updatedSegments[selectedSegmentIndex] = {
          ...updatedSegments[selectedSegmentIndex],
          imageUrl: newImageUrl,
          visualDescription: customImagePrompt
        };
        setSegments(updatedSegments);
      }
      setIsModalOpen(false);
    } catch (error) {
      console.error('Error regenerando imagen:', error);
      setMessage('Error al regenerar la imagen');
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || selectedSegmentIndex === null) return;

    try {
      // Crear una URL temporal para la imagen seleccionada
      const imageUrl = URL.createObjectURL(file);

      const updatedSegments = [...segments];
      updatedSegments[selectedSegmentIndex] = {
        ...updatedSegments[selectedSegmentIndex],
        imageUrl: imageUrl
      };
      setSegments(updatedSegments);
      setIsModalOpen(false);
    } catch (error) {
      console.error('Error cargando imagen:', error);
      setMessage('Error al cargar la imagen');
    }
  };

  // Selector de música mejorado
  const renderMusicSelector = () => (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Música de Fondo
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {backgroundMusicOptions.map(option => (
          <div
            key={option.value}
            onClick={() => setSelectedMusic(option.value as BackgroundMusic)}
            className={`
              border rounded-lg p-3 cursor-pointer transition-all duration-200
              ${selectedMusic === option.value
                ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}
            `}
          >
            <div className="flex items-center">
              <div className={`
                w-4 h-4 rounded-full mr-2 flex-shrink-0 border
                ${selectedMusic === option.value
                  ? 'border-blue-500 bg-blue-500'
                  : 'border-gray-300 bg-white'}
              `}>
                {selectedMusic === option.value && (
                  <svg className="w-4 h-4 text-white" viewBox="0 0 16 16" fill="currentColor">
                    <circle cx="8" cy="8" r="4" />
                  </svg>
                )}
              </div>
              <div>
                <p className="font-medium text-sm">{option.name}</p>
                <p className="text-xs text-gray-500">{option.description}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // Selector de transiciones mejorado
  const renderTransitionSelector = () => (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Transición entre escenas
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {transitionOptions.map(option => (
          <div
            key={option.value}
            onClick={() => setSelectedTransition(option.value as TransitionType)}
            className={`
              border rounded-lg p-3 cursor-pointer transition-all duration-200
              ${selectedTransition === option.value
                ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}
            `}
          >
            <div className="flex items-center">
              <div className={`
                w-4 h-4 rounded-full mr-2 flex-shrink-0 border
                ${selectedTransition === option.value
                  ? 'border-blue-500 bg-blue-500'
                  : 'border-gray-300 bg-white'}
              `}>
                {selectedTransition === option.value && (
                  <svg className="w-4 h-4 text-white" viewBox="0 0 16 16" fill="currentColor">
                    <circle cx="8" cy="8" r="4" />
                  </svg>
                )}
              </div>
              <div>
                <p className="font-medium text-sm">{option.name}</p>
                <p className="text-xs text-gray-500">{option.description}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // Añadir función para regenerar el script de un segmento
  const regenerateSegmentScript = async (index: number) => {
    try {
      setRegeneratingIndex(index);
      setMessage(`Regenerando script del segmento ${index + 1}...`);

      const requestData = {
        systemMessage: `Eres un experto en guiones de TikTok. Se te proporcionará un guion completo y se te pedirá regenerar un segmento específico manteniendo la coherencia con el resto de la historia.`,
        prompt: `Este es un guion de TikTok existente con ${segments.length} segmentos:

${segments.map((seg, i) => `
SEGMENTO ${i + 1}:
Narración: "${seg.narration}"
Descripción Visual: "${seg.visualDescription}"
`).join('\n')}

Por favor, regenera SOLO la narración del SEGMENTO ${index + 1}, manteniendo la coherencia con el resto de la historia.

El nuevo segmento debe mantener un estilo similar y conectar bien con los segmentos anterior y siguiente, pero puede ser diferente al actual (siempre y cuando sea coherente con la imagen (descripción visual)).
Responde SOLO con la nueva narración, sin explicaciones adicionales.`,
        segmentIndex: index,
        currentStory: {
          segments: segments.map(seg => ({
            narration: seg.narration,
            visualDescription: seg.visualDescription
          }))
        }
      };

      console.log('🔄 Regenerando segmento:', index + 1);
      console.log('📝 Prompt original de la historia:', storyPrompt);
      console.log('🎯 Instrucciones enviadas a la IA:', requestData.prompt);
      console.log('📚 Contexto completo:', requestData.currentStory);

      const response = await fetch('/api/tiktok-video/generate-story', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      });

      const data = await response.json();
      console.log('✅ Respuesta de la IA:', data);

      if (!data.segments || !data.segments[0]) {
        throw new Error('Formato de respuesta inválido');
      }

      const updatedSegments = [...segments];
      updatedSegments[index] = {
        ...updatedSegments[index],
        narration: data.segments[0].narration,
        subSegments: undefined
      };

      console.log('📝 Nuevo texto generado:', data.segments[0].narration);
      setSegments(updatedSegments);
      setMessage('Script regenerado con éxito');
    } catch (error) {
      console.error('❌ Error regenerando script:', error);
      setMessage('Error al regenerar el script');
    } finally {
      setRegeneratingIndex(null);
    }
  };

  // Modify the completed step UI to show intermediate outputs
  const renderCompletedStep = () => (
    <div className="space-y-6">
      <div className="bg-green-50 border border-green-200 rounded-lg p-6">
        <div className="flex items-center space-x-3 mb-4">
          <div className="flex-shrink-0">
            <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-green-800">¡Video Generado con Éxito!</h3>
        </div>
        <p className="text-sm text-green-600 mb-4">
          Tu video ha sido generado y descargado exitosamente.
        </p>

        {/* Background Images Used */}
        <div className="mt-6">
          <h4 className="text-lg font-medium text-gray-900 mb-4">Imágenes de Fondo Utilizadas</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {segments.map((segment, index) => (
              <div key={index} className="bg-white rounded-lg shadow overflow-hidden">
                <div className="aspect-[9/16] relative">
                  <img
                    src={segment.imageUrl}
                    alt={`Fondo ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white p-2">
                    <span className="text-sm font-medium">Segmento {index + 1}</span>
                  </div>
                </div>
                <div className="p-3">
                  <p className="text-xs text-gray-500 line-clamp-2">
                    {segment.visualDescription}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Final Video */}
        {generatedVideoUrl && (
          <div className="mt-4">
            <h4 className="text-lg font-medium text-gray-900 mb-4">Video Final</h4>
            <div className="relative aspect-[9/16] w-full max-w-sm mx-auto bg-black rounded-lg overflow-hidden">
              <video controls src={generatedVideoUrl} className="w-full h-full" />
            </div>
          </div>
        )}

        {/* Intermediate Outputs */}
        <div className="mt-6 space-y-4">
          <h4 className="text-lg font-medium text-gray-900">Archivos Intermedios</h4>

          {intermediateOutputs.rawAudio && (
            <div className="p-4 bg-white rounded-lg shadow">
              <h5 className="font-medium text-gray-700 mb-2">Audio Raw (Sin música)</h5>
              <audio controls src={intermediateOutputs.rawAudio} className="w-full" />
              <button
                onClick={() => downloadFile(intermediateOutputs.rawAudio, 'raw_audio.mp3')}
                className="mt-2 text-sm text-blue-600 hover:text-blue-800"
              >
                Descargar Audio Raw
              </button>
            </div>
          )}

          {intermediateOutputs.backgroundMusic && (
            <div className="p-4 bg-white rounded-lg shadow">
              <h5 className="font-medium text-gray-700 mb-2">Audio con Música de Fondo</h5>
              <audio controls src={intermediateOutputs.backgroundMusic} className="w-full" />
              <button
                onClick={() => downloadFile(intermediateOutputs.backgroundMusic, 'mixed_audio.mp3')}
                className="mt-2 text-sm text-blue-600 hover:text-blue-800"
              >
                Descargar Audio con Música
              </button>
            </div>
          )}

          {intermediateOutputs.rawVideo && (
            <div className="p-4 bg-white rounded-lg shadow">
              <h5 className="font-medium text-gray-700 mb-2">Video Raw (Sin subtítulos)</h5>
              <video controls src={intermediateOutputs.rawVideo} className="w-full max-w-sm mx-auto" />
              <button
                onClick={() => downloadFile(intermediateOutputs.rawVideo, 'raw_video.mp4')}
                className="mt-2 text-sm text-blue-600 hover:text-blue-800"
              >
                Descargar Video Raw
              </button>
            </div>
          )}

          {intermediateOutputs.subtitledVideo && (
            <div className="p-4 bg-white rounded-lg shadow">
              <h5 className="font-medium text-gray-700 mb-2">Video con Subtítulos (Sin música)</h5>
              <video controls src={intermediateOutputs.subtitledVideo} className="w-full max-w-sm mx-auto" />
              <button
                onClick={() => downloadFile(intermediateOutputs.subtitledVideo, 'subtitled_video.mp4')}
                className="mt-2 text-sm text-blue-600 hover:text-blue-800"
              >
                Descargar Video con Subtítulos
              </button>
            </div>
          )}
        </div>

        {/* Final Video Download Button */}
        <button
          onClick={() => finalVideoBlob && downloadFile(finalVideoBlob, 'video_final.mp4')}
          className="mt-6 w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
        >
          Descargar Video Final
        </button>
      </div>
    </div>
  );

  // Reemplazar el selector de subtítulos actual con este nuevo diseño
  const renderSubtitleStyleSelector = () => (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-700">
        Estilo de Subtítulos
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {subtitleStyles.map(style => (
          <div
            key={style.name}
            onClick={() => setSelectedStyle(style)}
            className={`
              relative p-4 border rounded-lg cursor-pointer transition-all duration-200
              ${selectedStyle.name === style.name
                ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200'
                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}
            `}
          >
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <div className={`
                  w-4 h-4 mt-0.5 rounded-full border flex-shrink-0
                  ${selectedStyle.name === style.name
                    ? 'border-blue-500 bg-blue-500'
                    : 'border-gray-300'}
                `}>
                  {selectedStyle.name === style.name && (
                    <svg className="w-4 h-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/>
                    </svg>
                  )}
                </div>
                <div>
                  <p className="font-medium text-sm text-gray-900">{style.name}</p>
                  <p className="text-xs text-gray-500 mt-1">{style.description}</p>
                </div>
              </div>

              {/* Demo del estilo */}
              <div className="relative w-full aspect-[16/6] bg-gray-900 rounded-md overflow-hidden"> {/* Cambiado de aspect-video a aspect-[16/6] */}
                <div className="absolute inset-0">
                  {/* Fondo de ejemplo */}
                  <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900" />

                  {/* Contenedor de subtítulos con animación */}
                  <div className="absolute inset-0 flex items-center justify-center p-1"> {/* Añadido p-1 para reducir márgenes */}
                    <div className={`
                      text-center animate-fade-in-out
                      ${style.splitColors ? 'space-y-1' : ''}
                    `}>
                      {style.splitColors ? (
                        <>
                          <div className="text-yellow-400 font-bold text-xl" style={{
                            textShadow: '2px 2px 4px rgba(0,0,0,0.9)',
                            WebkitTextStroke: '1.5px black',
                            letterSpacing: '0.5px',
                            fontFamily: '"The Bold Font", Arial, sans-serif', // Asegurar uso de la fuente
                            lineHeight: '1.1' // Reducir el espacio entre líneas
                          }}>
                            {style.demoText[0]}
                          </div>
                          <div className="text-white font-bold text-xl" style={{
                            textShadow: '2px 2px 4px rgba(0,0,0,0.9)',
                            WebkitTextStroke: '1.5px black',
                            letterSpacing: '0.5px',
                            fontFamily: '"The Bold Font", Arial, sans-serif',
                            lineHeight: '1.1'
                          }}>
                            {style.demoText[1]}
                          </div>
                        </>
                      ) : (
                        <div className="text-white font-bold text-xl" style={{
                          textShadow: '2px 2px 4px rgba(0,0,0,0.9)',
                          WebkitTextStroke: '1.5px black',
                          letterSpacing: '0.5px',
                          fontFamily: '"The Bold Font", Arial, sans-serif',
                          lineHeight: '1.1'
                        }}>
                          {style.demoText}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // Mejorar la opción de suscripción con más detalles y preview
  const renderSubscribeOption = () => (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-700">
        Animación de Suscripción
      </label>
      <div
        className={`
          relative p-4 border rounded-lg cursor-pointer transition-all duration-200
          ${includeSubscribeTag
            ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200'
            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}
        `}
        onClick={() => setIncludeSubscribeTag(!includeSubscribeTag)}
      >
        <div className="flex items-start gap-4">
          {/* Preview de la animación */}
          <div className="w-24 h-24 bg-gray-900 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden">
            <img
              src="/tags/suscribe.gif"
              alt="Preview animación"
              className="w-full h-full object-cover"
            />
          </div>

          <div className="flex-grow">
            <div className="flex items-start gap-3">
              <div className={`
                w-4 h-4 mt-0.5 rounded flex-shrink-0 border
                ${includeSubscribeTag
                  ? 'border-blue-500 bg-blue-500'
                  : 'border-gray-300'}
              `}>
                {includeSubscribeTag && (
                  <svg className="w-4 h-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/>
                  </svg>
                )}
              </div>
              <div>
                <p className="font-medium text-sm text-gray-900">Añadir animación de suscripción</p>
                <p className="text-xs text-gray-500 mt-1">
                  Aparecerá durante los últimos 2 segundos del video con un efecto de sonido
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800">
                    <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    2 segundos
                  </span>
                  <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800">
                    <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M12 9.5l3-3 3 3M9.464 9.464a5 5 0 007.072 0" />
                    </svg>
                    Con sonido
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Header con pasos */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 border-b border-gray-200">
          <h1 className="text-xl font-bold text-gray-800 mb-4">Generador de Videos</h1>

          {/* Steps Indicator - Responsive */}
          <div className="flex justify-between px-2 md:px-8">
        <StepIndicator
              step={ProcessStep.PROMPT}
          currentStep={currentStep}
              title="Escribir Prompt"
        />
            <div className="flex-grow border-t-2 border-gray-300 transform translate-y-4 mx-2"></div>
        <StepIndicator
              step={ProcessStep.CONFIG}
          currentStep={currentStep}
              title="Configuración"
        />
            <div className="flex-grow border-t-2 border-gray-300 transform translate-y-4 mx-2"></div>
        <StepIndicator
              step={ProcessStep.REVIEW}
          currentStep={currentStep}
              title="Revisar"
        />
            <div className="flex-grow border-t-2 border-gray-300 transform translate-y-4 mx-2"></div>
        <StepIndicator
          step={ProcessStep.COMPLETED}
          currentStep={currentStep}
          title="Video Listo"
        />
      </div>
      </div>

        {/* Contenido principal */}
        <div className="p-4 md:p-6">
          {/* Paso 1: Prompt */}
          {currentStep === ProcessStep.PROMPT && (
            <div className="space-y-4">
              <div className="bg-blue-50 rounded-lg p-4 mb-4">
                <h2 className="text-lg font-semibold text-blue-800 mb-2">Paso 1: Escribir Prompt</h2>
                <p className="text-sm text-blue-600">
                  Describe la historia que quieres crear y nuestro sistema generará un guion y las imágenes necesarias.
        </p>
      </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ¿Sobre qué quieres que trate la historia? (60 segundos)
              </label>
              <textarea
                value={storyPrompt}
                onChange={(e) => setStoryPrompt(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                rows={4}
                placeholder="Por ejemplo: Una historia sobre un gato que descubre que puede volar..."
              />
            </div>

            {renderGenerateStoryButton()}
          </div>
        )}

          {/* Paso 2: Configuración */}
          {currentStep === ProcessStep.CONFIG && (
          <div className="space-y-6">
              <div className="bg-blue-50 rounded-lg p-4 mb-4">
                <h2 className="text-lg font-semibold text-blue-800 mb-2">Paso 2: Configuración</h2>
                <p className="text-sm text-blue-600">
                  Personaliza cómo se verá y sonará tu video.
                </p>
              </div>

              {renderSubtitleStyleSelector()}
              {renderMusicSelector()}
              {renderTransitionSelector()}
              {renderSubscribeOption()}

              <button
                onClick={() => setCurrentStep(ProcessStep.REVIEW)}
                className="w-full py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200"
              >
                Continuar a Revisión
              </button>
            </div>
          )}

          {/* Paso 3: Revisar */}
          {currentStep === ProcessStep.REVIEW && (
            <div className="space-y-4 pb-8">
              <div className="bg-blue-50 rounded-lg p-4 mb-4">
                <h2 className="text-lg font-semibold text-blue-800 mb-2">Paso 3: Revisar</h2>
                <p className="text-sm text-blue-600">
                  Revisa y edita los segmentos antes de generar el video final.
                </p>
              </div>

              {/* Lista compacta de segmentos */}
              <div className="grid gap-3">
              {segments.map((segment, index) => (
                  <div
                    key={index}
                    className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:border-blue-300 transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row">
                      {/* Imagen */}
                      <div className="relative w-full sm:w-48 aspect-[16/9] sm:aspect-square bg-gray-100">
                      {segment.imageUrl ? (
                        <img
                          src={segment.imageUrl}
                            alt={`Segmento ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                            <div className="animate-spin h-6 w-6 border-b-2 border-blue-600"></div>
                        </div>
                      )}
                    <button
                      onClick={() => handleEditImage(index)}
                          className="absolute bottom-2 right-2 p-1.5 bg-white/90 backdrop-blur-sm rounded-full shadow-lg hover:bg-white"
                    >
                          <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                  </div>

                      {/* Contenido */}
                      <div className="flex-1 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
                              {index + 1}
                          </span>
                            <div className="flex items-center gap-1 text-xs text-gray-500">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              {estimateSegmentDuration(segment.narration)}s
                            </div>
                          </div>
                          <button
                            onClick={() => regenerateSegmentScript(index)}
                            disabled={regeneratingIndex !== null}
                            className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 disabled:opacity-50"
                          >
                            {regeneratingIndex === index ? (
                              <span className="flex items-center gap-1">
                                <div className="animate-spin h-3 w-3 border-b-2 border-current"></div>
                                Regenerando
                              </span>
                            ) : (
                              <span className="flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                                Regenerar
                              </span>
                            )}
                          </button>
                        </div>

                        <textarea
                          value={segment.narration}
                          onChange={(e) => {
                            const updatedSegments = [...segments];
                            updatedSegments[index] = {
                              ...updatedSegments[index],
                              narration: e.target.value
                            };
                            setSegments(updatedSegments);
                          }}
                          className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:border-blue-300 focus:ring-1 focus:ring-blue-300 resize-none"
                          rows={3}
                          placeholder="Narración del segmento..."
                        />
                    </div>
                  </div>
                </div>
              ))}
            </div>

              {/* Botón flotante de generar video */}
              <div className="fixed bottom-4 right-4 left-4 max-w-4xl mx-auto">
                <div className="bg-white/95 backdrop-blur-sm p-3 rounded-lg shadow-lg border border-gray-200">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 text-sm">
                      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>Total: {segments.reduce((acc, seg) => acc + estimateSegmentDuration(seg.narration), 0).toFixed(1)}s</span>
                    </div>
                {renderGenerateVideoButton()}
              </div>
                </div>
              </div>
          </div>
        )}

          {/* Paso 4: Video Listo */}
          {currentStep === ProcessStep.COMPLETED && (
          <div className="space-y-6">
              <div className="bg-green-50 rounded-lg p-4 mb-4">
                <h2 className="text-lg font-semibold text-green-800 mb-2">¡Video Generado!</h2>
                <p className="text-sm text-green-600">
                  Tu video está listo para descargar.
                </p>
                  </div>

              {/* Video player */}
              <div className="aspect-[9/16] bg-black rounded-lg overflow-hidden shadow-lg mx-auto max-w-sm">
                {generatedVideoUrl ? (
                  <video
                    src={generatedVideoUrl}
                    controls
                    className="w-full h-full"
                    poster="/video-thumbnail.jpg"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="animate-spin h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full"></div>
          </div>
        )}
              </div>

              {/* Botones de acción */}
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <a
                  href={generatedVideoUrl || '#'}
                  download="mi-video.mp4"
                  className={`px-4 py-2 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 flex items-center justify-center gap-2 ${!generatedVideoUrl ? 'opacity-50 cursor-not-allowed' : ''}`}
                  onClick={(e) => !generatedVideoUrl && e.preventDefault()}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Descargar Video
                </a>
                <button
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 rounded-md text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Crear Nuevo Video
                </button>
              </div>
            </div>
          )}
          </div>
        </div>

      <ImageEditModal
        isOpen={isImageEditModalOpen}
        onClose={() => setIsImageEditModalOpen(false)}
        segmentIndex={selectedImageIndex}
      />

      <LoadingOverlay />
    </div>
  );
}

