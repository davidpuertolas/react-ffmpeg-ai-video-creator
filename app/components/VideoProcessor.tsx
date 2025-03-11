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
  INITIAL = 'initial',
  STORY_GENERATED = 'story_generated',
  GENERATING = 'generating',
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

const subtitleStyles = [
  {
    name: 'Classic',
    fontsize: 45,
    fontcolor: 'white',
    borderw: 6,
    bordercolor: 'black',
    shadowcolor: 'black@0.8',
    shadowx: 3,
    shadowy: 3,
    y: '(h-text_h)/2', // Centrado vertical
  },
  {
    name: 'TikTok Split',
    fontsize: 45,
    fontcolor: 'white',
    borderw: 6,
    bordercolor: 'black',
    shadowcolor: 'black@0.9',
    shadowx: 4,
    shadowy: 4,
    splitColors: true,
    secondLineColor: 'yellow',
    y: '(h-text_h)/2-30', // Centrado vertical, ajustado para las dos líneas
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
  const [currentStep, setCurrentStep] = useState<ProcessStep>(ProcessStep.INITIAL);
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

  // Subtitle Preview Component
  const SubtitlePreview = () => {
    const style = selectedStyle;
    const previewText = style.splitColors ?
      ['PRIMERA LÍNEA', 'SEGUNDA LÍNEA'] :
      'Preview Subtitle';

    const containerStyle = {
      width: '100%',
      height: '200px',
      backgroundColor: '#333',
      display: 'flex',
      flexDirection: 'column' as const,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: '10px',
      overflow: 'hidden',
      position: 'relative' as const,
    };

    const textContainerStyle = {
      position: 'relative' as const,
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      gap: '10px',
    };

    const getTextStyle = (color: string) => ({
      fontSize: `${style.fontsize * 0.7}px`,
      fontWeight: 'normal' as const,
      textAlign: 'center' as const,
      color: color,
      WebkitTextStroke: `${style.borderw/2}px ${style.bordercolor}`,
      textShadow: `
        ${style.shadowx}px ${style.shadowy}px ${style.shadowcolor},
        ${-style.shadowx}px ${style.shadowy}px ${style.shadowcolor},
        ${style.shadowx}px ${-style.shadowy}px ${style.shadowcolor},
        ${-style.shadowx}px ${-style.shadowy}px ${style.shadowcolor}
      `,
      fontFamily: 'The Bold Font, Arial, sans-serif',
      letterSpacing: '1px',
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
        setCurrentStep(ProcessStep.STORY_GENERATED);
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
        'subscribe.gif',
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
      setCurrentStep(ProcessStep.GENERATING);

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
        const musicResponse = await fetch(`/songs/${selectedMusic}.mp3`);
        const musicArrayBuffer = await musicResponse.arrayBuffer();
        await ffmpeg.writeFile('background_music.mp3', new Uint8Array(musicArrayBuffer));

        // Combinar el audio narrado con la música de fondo, extendiendo la duración
        await ffmpeg.exec([
          '-i', 'raw_audio.mp3',
          '-i', 'background_music.mp3',
          '-filter_complex',
          `[0:a]apad=pad_dur=${FINAL_EXTENSION}[voice];` +
          '[1:a]volume=0.3[music];' +
          '[voice][music]amix=inputs=2:duration=longest[aout]',
          '-map', '[aout]',
          'mixed_audio.mp3'
        ]);

        // Renombrar el audio final
        await ffmpeg.exec([
          '-i', 'mixed_audio.mp3',
          '-c', 'copy',
          'final_audio.mp3'
        ]);
      }

      // Step 7: Final video generation
      setMessage('Generando video final...');
      console.log('🎥 Comenzando generación del video final...');

      let ffmpegArgs = [
        '-i', 'input.mp4',
        '-i', 'final_audio.mp3',
        '-filter_complex',
        `[0:v]fade=t=in:st=0:d=${FADE_IN_DURATION},${finalFilter}[v]`, // Añadir fade in aquí
        '-map', '[v]',
        '-map', '1:a:0',
        '-c:v', 'libx264',
        '-r', '30',
        '-preset', 'ultrafast',
        '-tune', 'zerolatency',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ac', '2',
        '-ar', '44100',
        '-threads', '0',
        '-t', totalVideoDuration.toString(),
        '-shortest',
        '-async', '1',
        '-fps_mode', 'vfr',
        '-y',
        'final_output.mp4'
      ];

      // Generar el video inicial
      await ffmpeg.exec(ffmpegArgs);
      console.log('✅ Video base generado correctamente');

      // Si hay tag de suscripción, agregarlo usando la duración total correcta
      if (includeSubscribeTag) {
        console.log('🎯 Agregando tag de suscripción');
        await addSubscribeTag(totalVideoDuration);
      }

      // Continuar con el código existente para descargar el video...
      const data = await ffmpeg.readFile('final_output.mp4');
      const blob = new Blob([data], { type: 'video/mp4' });
      const videoUrl = URL.createObjectURL(blob);
      setGeneratedVideoUrl(videoUrl);
      setFinalVideoBlob(blob);

      // After processing audio segments, create a URL for the raw audio
      await ffmpeg.exec([
        '-f', 'concat',
        '-safe', '0',
        '-i', 'concat.txt',
        '-c', 'copy',
        'raw_audio.mp3'
      ]);

      const rawAudioData = await ffmpeg.readFile('raw_audio.mp3');
      const rawAudioUrl = URL.createObjectURL(new Blob([rawAudioData], { type: 'audio/mp3' }));
      setIntermediateOutputs(prev => ({ ...prev, rawAudio: rawAudioUrl }));

      // If background music is selected, create a URL for the mixed audio
      if (selectedMusic !== BackgroundMusic.NONE) {
        await ffmpeg.exec([
          '-i', 'raw_audio.mp3',
          '-i', 'background_music.mp3',
          '-filter_complex',
          `[0:a]apad=pad_dur=${FINAL_EXTENSION}[voice];` +
          '[1:a]volume=0.3[music];' +
          '[voice][music]amix=inputs=2:duration=longest[aout]',
          '-map', '[aout]',
          'mixed_audio.mp3'
        ]);

        const mixedAudioData = await ffmpeg.readFile('mixed_audio.mp3');
        const mixedAudioUrl = URL.createObjectURL(new Blob([mixedAudioData], { type: 'audio/mp3' }));
        setIntermediateOutputs(prev => ({ ...prev, backgroundMusic: mixedAudioUrl }));
      }

      // After generating the base video, create a URL for it
      const rawVideoData = await ffmpeg.readFile('input.mp4');
      const rawVideoUrl = URL.createObjectURL(new Blob([rawVideoData], { type: 'video/mp4' }));
      setIntermediateOutputs(prev => ({ ...prev, rawVideo: rawVideoUrl }));

      // After adding subtitles but before final mix, create a URL
      const subtitledVideoData = await ffmpeg.readFile('temp_video.mp4');
      const subtitledVideoUrl = URL.createObjectURL(new Blob([subtitledVideoData], { type: 'video/mp4' }));
      setIntermediateOutputs(prev => ({ ...prev, subtitledVideo: subtitledVideoUrl }));

      clearInterval(loggingInterval);
      setProgress(100);
      setMessage('¡Video generado con éxito!');
      setCurrentStep(ProcessStep.COMPLETED);

      return {
        finalVideo: videoUrl,
        intermediateOutputs
      };
    } catch (error) {
      console.error('Error en generateFinalVideo:', error);
      setMessage(`Error: ${error.message}`);
      throw error;
    } finally {
      // Limpiar el intervalo si existe
      if (loggingInterval) {
        clearInterval(loggingInterval);
      }
      await cleanupFFmpegFiles();
      setLoading(false);
    }
  };

  // Función separada para agregar el tag de suscripción
  const addSubscribeTag = async (totalDuration: number) => {
    try {
      await ffmpeg.exec(['-i', 'final_output.mp4', '-c', 'copy', 'temp_video.mp4']);

      // Cargar recursos
      await Promise.all([
        loadResource('subscribe.gif', '/tags/suscribe.gif'),
        loadResource('click.mp3', '/tags/click.mp3')
      ]);

      const tagStart = totalDuration - SUBSCRIBE_TAG_DURATION;
      const clickTime = totalDuration - CLICK_SOUND_OFFSET;

      await ffmpeg.exec([
        '-i', 'temp_video.mp4',
        '-ignore_loop', '0',
        '-i', 'subscribe.gif',
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

  const StepIndicator = ({ step, currentStep, title }: {
    step: ProcessStep,
    currentStep: ProcessStep,
    title: string
  }) => {
    const isActive = currentStep === step;
    const isCompleted = getStepNumber(currentStep) > getStepNumber(step);

    return (
      <div className={`flex items-center ${isCompleted ? 'text-green-600' : isActive ? 'text-blue-600' : 'text-gray-400'}`}>
        <div className={`
          flex items-center justify-center w-8 h-8 rounded-full border-2
          ${isCompleted ? 'bg-green-100 border-green-600' :
            isActive ? 'bg-blue-100 border-blue-600' :
            'bg-gray-100 border-gray-400'}
        `}>
          {isCompleted ? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
            </svg>
          ) : (
            <span>{getStepNumber(step)}</span>
          )}
        </div>
        <span className="ml-2 font-medium">{title}</span>
      </div>
    );
  };

  const getStepNumber = (step: ProcessStep): number => {
    const steps = [
      ProcessStep.INITIAL,
      ProcessStep.STORY_GENERATED,
      ProcessStep.GENERATING,
      ProcessStep.COMPLETED
    ];
    return steps.indexOf(step) + 1;
  };

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

  const renderGenerateVideoButton = () => {
    if (!ffmpegLoaded) {
      return (
        <button
          disabled
          className="w-full py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gray-400 cursor-not-allowed"
        >
          Inicializando FFmpeg...
        </button>
      );
    }

    if (ffmpegError) {
      return (
        <div className="text-red-600 text-sm mb-2">
          Error: {ffmpegError}
          <button
            onClick={() => window.location.reload()}
            className="w-full mt-2 py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700"
          >
            Reintentar
          </button>
        </div>
      );
    }

    return (
      <button
        onClick={generateFinalVideo}
        disabled={loading}
        className="w-full py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
        Generar Video
      </button>
    );
  };

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

  // Modificar el botón de generar historia para incluir la barra de progreso
  const renderGenerateStoryButton = () => (
    <div className="space-y-4">
      <button
        onClick={() => generateStorySegments(storyPrompt)}
        disabled={loading || !storyPrompt}
        className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
        Generar Historia
      </button>

      {loading && (
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">{message}</span>
            <span className="text-sm font-medium text-blue-600">{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      )}
    </div>
  );

  const handleEditImage = (index: number) => {
    setSelectedSegmentIndex(index);
    setCustomImagePrompt(segments[index].visualDescription);
    setIsModalOpen(true);
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

  // Añadir el selector de música antes del botón de generar video
  const renderMusicSelector = () => (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Música de Fondo
      </label>
      <select
        value={selectedMusic}
        onChange={(e) => setSelectedMusic(e.target.value as BackgroundMusic)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {backgroundMusicOptions.map(option => (
          <option key={option.value} value={option.value}>
            {option.name} - {option.description}
          </option>
        ))}
      </select>
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

  // Add a transition selector component
  const renderTransitionSelector = () => (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Transición entre escenas
      </label>
      <select
        value={selectedTransition}
        onChange={(e) => setSelectedTransition(e.target.value as TransitionType)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {transitionOptions.map(option => (
          <option key={option.value} value={option.value}>
            {option.name} - {option.description}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {/* Steps Indicator */}
      <div className="flex justify-between mb-8">
        <StepIndicator
          step={ProcessStep.INITIAL}
          currentStep={currentStep}
          title="Generar Historia"
        />
        <StepIndicator
          step={ProcessStep.STORY_GENERATED}
          currentStep={currentStep}
          title="Revisar Historia"
        />
        <StepIndicator
          step={ProcessStep.GENERATING}
          currentStep={currentStep}
          title="Generando Video"
        />
        <StepIndicator
          step={ProcessStep.COMPLETED}
          currentStep={currentStep}
          title="Video Listo"
        />
      </div>

      {/* Subtitle Style Selection */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Subtitle Style
        </label>
        <select
          value={selectedStyle.name}
          onChange={(e) => {
            const style = subtitleStyles.find(s => s.name === e.target.value);
            if (style) setSelectedStyle(style);
          }}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {subtitleStyles.map(style => (
            <option key={style.name} value={style.name}>
              {style.name}
            </option>
          ))}
        </select>
      </div>

      {/* Subscribe Tag Option */}
      <div className="mb-4">
        <label className="flex items-center space-x-3">
          <input
            type="checkbox"
            checked={includeSubscribeTag}
            onChange={(e) => setIncludeSubscribeTag(e.target.checked)}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <span className="text-sm font-medium text-gray-700">
            Incluir animación de suscripción al final del video
          </span>
        </label>
        <p className="mt-1 text-sm text-gray-500">
          Añade una animación de "Suscríbete" durante los últimos 2 segundos del video
        </p>
      </div>

      {/* Subtitle Preview */}
      <div className="mb-4">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Subtitle Preview</h3>
        <SubtitlePreview />
      </div>

      {/* Step Content */}
      <div className="border rounded-lg p-6 bg-white shadow-sm">
        {currentStep === ProcessStep.INITIAL && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold mb-4">Paso 1: Generar Historia</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ¿Sobre qué quieres que trate la historia? (60 segundos)
              </label>
              <textarea
                value={storyPrompt}
                onChange={(e) => setStoryPrompt(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={4}
                placeholder="Por ejemplo: Una historia sobre un gato que descubre que puede volar..."
              />
            </div>
            {renderGenerateStoryButton()}
          </div>
        )}

        {currentStep >= ProcessStep.STORY_GENERATED && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold mb-4">Historia Generada</h2>
            <div className="space-y-4">
              {segments.map((segment, index) => (
                <div key={index} className="flex gap-4">
                  {/* Contenedor de imagen con botón de edición */}
                  <div className="relative w-48 h-48 flex-shrink-0">
                    <div className="w-full h-full bg-gray-200 rounded-lg overflow-hidden">
                      {segment.imageUrl ? (
                        <img
                          src={segment.imageUrl}
                          alt={`Imagen para segmento ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600"></div>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleEditImage(index)}
                      className="absolute top-2 right-2 p-2 bg-white rounded-full shadow-lg hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                      </svg>
                    </button>
                  </div>

                  {/* Contenido del segmento */}
                  <div className="flex-grow">
                    <div className="p-4 border rounded-md bg-gray-50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-blue-600">
                          Segmento {index + 1}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-500">
                            {segment.timeStart}s - {segment.timeEnd}s
                          </span>
                          <button
                            onClick={() => regenerateSegmentScript(index)}
                            disabled={regeneratingIndex !== null}
                            className="px-2 py-1 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-1"
                          >
                            {regeneratingIndex === index ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                            )}
                            {regeneratingIndex === index ? 'Regenerando...' : 'Regenerar Script'}
                          </button>
                        </div>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Narración:</h4>
                        <textarea
                          value={segment.narration}
                          onChange={(e) => updateSegmentNarration(index, e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-gray-600 resize-none bg-white"
                          rows={4}
                          style={{ minHeight: '100px' }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {currentStep === ProcessStep.STORY_GENERATED && (
              <div className="space-y-6">
                {renderTransitionSelector()}
                {renderMusicSelector()}
                {renderGenerateVideoButton()}
              </div>
            )}
          </div>
        )}

        {currentStep === ProcessStep.GENERATING && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold mb-4">Generando Video</h2>
            <div className="space-y-4">
              {/* Panel de progreso mejorado */}
              <div className="bg-blue-50 p-6 rounded-lg border border-blue-100">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                      <span className="font-medium text-blue-800">{message}</span>
                    </div>
                    <span className="text-blue-600 font-semibold">{progress}%</span>
                  </div>

                  <div className="w-full bg-blue-100 rounded-full h-2.5">
                    <div
                      className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>

                  {/* Lista de pasos con estado */}
                  <div className="mt-4 space-y-2">
                    <StepStatus
                      completed={progress >= 25}
                      current={progress < 25}
                      title="Generando Audios"
                      description="Creando voces para cada segmento..."
                    />
                    <StepStatus
                      completed={progress >= 40}
                      current={progress >= 25 && progress < 40}
                      title="Generando Subtítulos"
                      description="Sincronizando texto con audio..."
                    />
                    <StepStatus
                      completed={progress >= 60}
                      current={progress >= 40 && progress < 60}
                      title="Procesando Audio"
                      description="Combinando segmentos de audio..."
                    />
                    <StepStatus
                      completed={progress >= 90}
                      current={progress >= 60 && progress < 90}
                      title="Renderizando Video"
                      description="Mezclando video, audio y subtítulos..."
                    />
                    <StepStatus
                      completed={progress === 100}
                      current={progress >= 90 && progress < 100}
                      title="Finalizando"
                      description="Preparando video final..."
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {currentStep === ProcessStep.COMPLETED && renderCompletedStep()}
      </div>

      {/* Modal para editar imagen */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Editar Imagen del Segmento {selectedSegmentIndex !== null ? selectedSegmentIndex + 1 : ''}
            </h3>

            <div className="space-y-4">
              {/* Prompt para regenerar imagen */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Descripción para generar nueva imagen
                </label>
                <textarea
                  value={customImagePrompt}
                  onChange={(e) => setCustomImagePrompt(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                />
              </div>

              {/* Botones de acción */}
              <div className="space-y-3">
                <button
                  onClick={handleRegenerateImage}
                  disabled={isRegenerating || !customImagePrompt}
                  className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {isRegenerating ? 'Regenerando...' : 'Regenerar con IA'}
                </button>

                <div className="relative">
                  <input
                    type="file"
                    onChange={handleFileUpload}
                    accept="image/*"
                    className="hidden"
                    id="image-upload"
                  />
                  <label
                    htmlFor="image-upload"
                    className="w-full py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 cursor-pointer flex items-center justify-center"
                  >
                    Subir imagen del equipo
                  </label>
                </div>

                <button
                  onClick={() => setIsModalOpen(false)}
                  className="w-full py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
