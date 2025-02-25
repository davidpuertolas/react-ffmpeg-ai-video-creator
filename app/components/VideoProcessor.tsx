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

const transitionTypes = [
  {
    name: 'Fade',
    value: 'fade',
    description: 'Fundido suave entre imágenes'
  },
  {
    name: 'Slide Left',
    value: 'slideLeft',
    description: 'Deslizamiento hacia la izquierda'
  },
  {
    name: 'Slide Right',
    value: 'slideRight',
    description: 'Deslizamiento hacia la derecha'
  },
  {
    name: 'Zoom Out',
    value: 'zoomOut',
    description: 'Efecto de círculo cerrándose'
  },
  {
    name: 'Zoom In',
    value: 'zoomIn',
    description: 'Efecto de círculo abriéndose'
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
  const [selectedTransition, setSelectedTransition] = useState(transitionTypes[0]);
  const [includeSubscribeTag, setIncludeSubscribeTag] = useState(false);
  const [selectedMusic, setSelectedMusic] = useState<BackgroundMusic>(BackgroundMusic.NONE);
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);

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

      const response = await fetch('/api/tiktok-video/generate-story', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
      });

      const story = await response.json();
      console.log(story);
      if (!story.segments || !Array.isArray(story.segments)) {
        throw new Error('Formato de respuesta inválido');
      }

      // Ahora generamos las imágenes para cada segmento en paralelo
      setMessage('Generando imágenes para la historia...');
      const segmentsWithImages = [...story.segments];

      try {
        const imagePromises = segmentsWithImages.map((segment, index) => {
          setMessage(`Generando imágenes ${index + 1} de ${segmentsWithImages.length}...`);
          return generateImageForSegment(segment.visualDescription)
            .catch(error => {
              console.error(`Error generando imagen ${index + 1}:`, error);
              return null;
            });
        });

        const imageUrls = await Promise.all(imagePromises);

        // Limpiar el intervalo cuando se complete
        clearInterval(progressInterval);

        // Actualizamos los segmentos con las URLs de las imágenes
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
        console.error('Error generando imágenes:', error);
        throw new Error('Error al generar las imágenes: ' + (error.message || 'Error desconocido'));
      }
    } catch (error) {
      console.error('Error generating story:', error);
      throw new Error('Error al generar la historia: ' + (error.message || 'Error desconocido'));
    } finally {
      setLoading(false);
    }
  };

  const generateAudioForSegment = async (text: string, index: number) => {
    try {
      const response = await fetch('/api/tiktok-video/generate-speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      });

      const blob = new Blob([await response.arrayBuffer()], { type: 'audio/mpeg' });
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

  const generateSRT = (segments: StorySegment[]) => {
    let srtContent = '';
    let subtitleIndex = 1;

    segments.forEach(segment => {
      if (!segment.subSegments) {
        const sentences = segment.narration.split('.').filter(s => s.trim());
        const subSegments: SubSegment[] = [];
        const segmentDuration = (segment.timeEnd - segment.timeStart) - 0.3;

        // Calcular el total de caracteres en todas las frases
        const totalChars = sentences.reduce((sum, sentence) => sum + sentence.trim().length, 0);
        let currentTime = segment.timeStart;

        sentences.forEach((sentence) => {
          const words = sentence.trim().split(' ');
          const wordsPerSubSegment = 3;

          // Calcular la duración proporcional basada en la longitud de la frase
          const sentenceDuration = (sentence.length / totalChars) * segmentDuration;
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

  const getTransitionFilter = (index: number, totalSegments: number) => {
    switch (selectedTransition.value) {
      case 'slideLeft':
        return 'xfade=transition=slideleft';
      case 'slideRight':
        return 'xfade=transition=slideright';
      case 'zoomOut':
        // Usar transiciones más compatibles para zoom
        return 'xfade=transition=circleclose';
      case 'zoomIn':
        // Usar transiciones más compatibles para zoom
        return 'xfade=transition=circleopen';
      case 'fade':
      default:
        return 'xfade=transition=fade';
    }
  };

  // Añadir una constante para la duración de la transición
  const TRANSITION_DURATION = 0.5; // medio segundo para la transición

  const generateFinalVideo = async () => {
    if (!ffmpeg || !ffmpegLoaded) {
      setMessage('Error: FFmpeg no está inicializado. Por favor, recarga la página.');
      throw new Error('FFmpeg no está inicializado');
    }

    try {
      setLoading(true);
      setCurrentStep(ProcessStep.GENERATING);

      // Primero generamos y medimos todos los audios
      const updatedSegments = [...segments];
      let currentTime = 0;
      const blobs: Blob[] = [];

      let videoDuration = 0;
      // Generate all audio files first and get exact durations
      for (let i = 0; i < updatedSegments.length; i++) {
        setProgress(Math.round((i / segments.length) * 25));
        setMessage(`Generando audio ${i + 1} de ${segments.length}...`);
        console.log(`🎵 Generando audio para segmento ${i + 1}...`);

        const audioBlob = await generateAudioForSegment(updatedSegments[i].narration, i);
        const duration = await getAudioDuration(audioBlob);
        console.log(`✓ Audio ${i + 1} generado (duración: ${duration}s)`);
        videoDuration += duration;
        console.log('📊 Duración actual del video:', videoDuration, 'segundos');
        // Añadir tiempo extra para la transición, excepto para el último segmento
        const transitionTime = i < updatedSegments.length - 1 ? TRANSITION_DURATION : 0;

        updatedSegments[i] = {
          ...updatedSegments[i],
          timeStart: currentTime,
          timeEnd: currentTime + duration + transitionTime, // Añadimos el tiempo de transición
          subSegments: undefined
        };
        currentTime += duration + transitionTime;
        blobs.push(audioBlob);
      }

      setSegments(updatedSegments);
      setAudioBlobs(blobs);

      // Step 2: Generate SRT with correct timings
      setProgress(30);
      setMessage('Generando subtítulos...');
      console.log('📝 Generando archivo de subtítulos...');
      const srt = generateSRT(updatedSegments); // Esto actualizará los subSegments
      setSrtContent(srt);
      console.log('✅ Subtítulos generados correctamente');

      // Pequeña pausa para asegurar que todo está listo
      await new Promise(resolve => setTimeout(resolve, 1000));

      if (!ffmpeg) {
        throw new Error('FFmpeg no está inicializado');
      }

      // Step 3: Initialize FFmpeg
      setProgress(40);
      setMessage('Preparando el procesador de video...');
      console.log('🎬 Iniciando FFmpeg...');

      ffmpeg.on('log', ({ message }) => {
        console.log('FFmpeg:', message);
        if (message.includes('Error') || message.includes('error')) {
          setMessage(`Error en FFmpeg: ${message}`);
        }
      });

      ffmpeg.on('progress', ({ progress }) => {
        const percentage = Math.round(progress * 50) + 40; // 40-90%
        setProgress(percentage);
        setMessage(`Mezclando video y audio: ${Math.round(progress * 100)}%`);
      });

      // Step 4: Load and prepare all files
      setProgress(45);
      setMessage('Preparando imágenes...');
      console.log('🖼️ Preparando imágenes para el video...');

      // Asegúrate de que las imágenes se escriben correctamente
      for (let i = 0; i < updatedSegments.length; i++) {
        const segment = updatedSegments[i];
        if (!segment.imageUrl) continue;

        const imageResponse = await fetch(segment.imageUrl);
        const imageData = await imageResponse.arrayBuffer();
        await ffmpeg.writeFile(`image_${i}.jpg`, new Uint8Array(imageData));
      }

      let filterComplex = '';

      // Primero procesamos cada imagen individualmente
      for (let i = 0; i < updatedSegments.length; i++) {
        const segment = updatedSegments[i];
        const duration = segment.timeEnd - segment.timeStart;

        // Escalado y procesamiento básico de cada imagen
        filterComplex += `[${i}:v]scale=540:960:force_original_aspect_ratio=increase,`;
        filterComplex += 'crop=540:960,';
        filterComplex += 'fps=30,';

        // Aplicamos el efecto de zoom
        filterComplex += `zoompan=z='min(zoom+0.0015,1.5)':d=${Math.round(duration*30)}:s=540x960:fps=30,`;

        // Fade in para el primer segmento
        if (i === 0) {
          filterComplex += 'fade=in:st=0:d=1.5,';
        }

        // Establecemos la duración exacta del segmento
        filterComplex += `trim=0:${duration},`;
        filterComplex += 'setpts=PTS-STARTPTS';

        // Nombramos el output stream
        filterComplex += `[base${i}];`;
      }

      // Ahora aplicamos las transiciones
      if (updatedSegments.length > 1) {
        // Procesamos el primer segmento
        filterComplex += `[base0]`;

        // Aplicamos transiciones entre segmentos consecutivos
        for (let i = 1; i < updatedSegments.length; i++) {
          const transition = getTransitionFilter(i, updatedSegments.length);
          // Ajustar el offset para que comience TRANSITION_DURATION segundos antes del final
          const offset = updatedSegments[i-1].timeEnd - TRANSITION_DURATION;

          if (i === 1) {
            filterComplex += `[base1]${transition}:duration=${TRANSITION_DURATION}:offset=${offset}[v1];`;
          } else {
            filterComplex += `[v${i-1}][base${i}]${transition}:duration=${TRANSITION_DURATION}:offset=${offset}[v${i}];`;
          }
        }

        // Usamos el último stream como salida final
        filterComplex += `[v${updatedSegments.length-1}]`;
      } else {
        // Si solo hay un segmento, usamos su base directamente
        filterComplex += `[base0]`;
      }

      // Configuración final del video
      filterComplex += `format=yuv420p[v]`;

      // Modificar los argumentos de entrada para incluir el tiempo de transición
      const inputArgs = updatedSegments.map((segment, i) => {
        const duration = segment.timeEnd - segment.timeStart;
        return [
          '-loop', '1',
          '-t', `${duration}`, // Ya incluye el tiempo de transición desde el cálculo anterior
          '-i', `image_${i}.jpg`
        ];
      }).flat();

      // Generar el video base con los nuevos argumentos
      await ffmpeg.exec([
        ...inputArgs,
        '-filter_complex', filterComplex,
        '-map', '[v]',
        '-fps_mode', 'cfr',
        '-pix_fmt', 'yuv420p',
        '-r', '30',
        '-preset', 'ultrafast',
        '-tune', 'fastdecode',
        '-threads', '0',
        '-c:v', 'libx264',
        '-crf', '23',
        '-movflags', '+faststart',
        'input.mp4'
      ]);

      // Verificar que el archivo se creó correctamente
      const fileExists = await ffmpeg.readFile('input.mp4').then(() => true).catch(() => false);
      if (!fileExists) {
        throw new Error('Error generando el video base');
      }

      console.log('✅ Video base generado a partir de imágenes');

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

      for (let i = 0; i < blobs.length; i++) {
        const arrayBuffer = await blobs[i].arrayBuffer();
        await ffmpeg.writeFile(`segment_${i}.mp3`, new Uint8Array(arrayBuffer));
        console.log(`✓ Audio ${i + 1} preparado`);
      }

      // Create concat file and merge audio
      console.log('🔄 Combinando archivos de audio...');
      const concatFile = blobs.map((_, i) => `file 'segment_${i}.mp3'`).join('\n');
      await ffmpeg.writeFile('concat.txt', concatFile);

      setMessage('Combinando archivos de audio...');
      await ffmpeg.exec([
        '-f', 'concat',
        '-safe', '0',
        '-i', 'concat.txt',
        '-c', 'copy',
        'output.mp3'
      ]);
      console.log('✅ Audio combinado correctamente');

      // Pequeña pausa para asegurar que el audio está listo
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Step 6: Prepare text filters
      setProgress(60);
      setMessage('Preparando efectos de texto...');
      console.log('✍️ Generando filtros de texto para subtítulos...');

      // Asegurarnos de que estamos usando los segmentos actualizados con subSegments
      const textFilters = updatedSegments.flatMap(segment =>
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

        // Combinar el audio narrado con la música de fondo
        await ffmpeg.exec([
          '-i', 'output.mp3',
          '-i', 'background_music.mp3',
          '-filter_complex',
          '[0:a]volume=3[voice];[1:a]volume=0.3[music];[voice][music]amix=inputs=2:duration=first[aout]',
          '-map', '[aout]',
          'final_audio.mp3'
        ]);

        // Renombrar el audio final
        await ffmpeg.exec([
          '-i', 'final_audio.mp3',
          '-c', 'copy',
          'output.mp3'
        ]);
      }

      // Step 7: Final video generation
      setMessage('Generando video final...');
      console.log('🎥 Comenzando generación del video final...');

      let ffmpegArgs = [
        '-i', 'input.mp4',
        '-i', 'output.mp3',
        '-filter_complex',
        `[0:v]${finalFilter}[v]`,
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
        '-t', currentTime.toString(),
        '-shortest',
        '-async', '1',
        '-fps_mode', 'vfr',
        '-y',
        'final_output.mp4'
      ];

      // Generar el video inicial
      await ffmpeg.exec(ffmpegArgs);
      console.log('✅ Video base generado correctamente');

      // Modificar la parte donde ejecutamos FFmpeg con el GIF
      if (includeSubscribeTag) {
        console.log('🎯 Añadiendo tag de suscripción superpuesto al final del video...');
        try {
          // Renombrar el video original
          await ffmpeg.exec(['-i', 'final_output.mp4', '-c', 'copy', 'temp_video.mp4']);

          // Cargar el GIF
          const subscribeResponse = await fetch('/tags/suscribe.gif');
          if (!subscribeResponse.ok) {
            throw new Error(`No se pudo cargar el gif de suscripción. Status: ${subscribeResponse.status}`);
          }
          const subscribeData = await subscribeResponse.arrayBuffer();
          await ffmpeg.writeFile('subscribe.gif', new Uint8Array(subscribeData));

          // Cargar el sonido de click
          const clickResponse = await fetch('/tags/click.mp3');
          if (!clickResponse.ok) {
            throw new Error(`No se pudo cargar el sonido de click. Status: ${clickResponse.status}`);
          }
          const clickData = await clickResponse.arrayBuffer();
          await ffmpeg.writeFile('click.mp3', new Uint8Array(clickData));

          console.log('✅ GIF y sonido preparados');
          console.log('📊 Duración total del video:', videoDuration, 'segundos');

          // Nuevo enfoque combinando video, GIF y sonido
          await ffmpeg.exec([
            '-i', 'temp_video.mp4',
            '-ignore_loop', '0',
            '-i', 'subscribe.gif',
            '-i', 'click.mp3', // Añadir el sonido de click
            '-filter_complex',
            `[1:v]scale=525:930,setpts=PTS-STARTPTS+${videoDuration-2}/TB[gif];` +
            `[0:v][gif]overlay=(W-w)/2:(H-h)/15:enable='between(t,${videoDuration-2},${videoDuration})'[v];` +
            // Ajustar el timing y volumen del click
            `[2:a]adelay=${(videoDuration-1)*1000}|${(videoDuration-1)*1000},volume=0.3[click];` +
            // Mezclar el audio original con el click
            `[0:a][click]amix=inputs=2:duration=first[a]`,
            '-map', '[v]',
            '-map', '[a]',
            '-t', videoDuration.toString(),
            '-y',
            'final_output_with_subscribe.mp4'
          ]);

          // Reemplazar el video final
          await ffmpeg.exec([
            '-i', 'final_output_with_subscribe.mp4',
            '-c', 'copy',
            '-y',
            'final_output.mp4'
          ]);

          console.log('✅ Tag de suscripción y sonido añadidos correctamente');
        } catch (error) {
          console.error('❌ Error al añadir tag de suscripción:', error);
          console.error('Stack trace:', error.stack);
          setMessage('Error al añadir la animación de suscripción. Se mantendrá el video original.');
        }
      }

      // Continuar con el código existente para descargar el video...
      const data = await ffmpeg.readFile('final_output.mp4');
      const blob = new Blob([data], { type: 'video/mp4' });
      const videoUrl = URL.createObjectURL(blob);
      setGeneratedVideoUrl(videoUrl);
      setFinalVideoBlob(blob);
      //downloadFile(blob, 'video_final.mp4'); //auto download

      console.log('🎉 ¡Proceso completado con éxito!');
      setProgress(100);
      setMessage('¡Video generado con éxito!');
      setCurrentStep(ProcessStep.COMPLETED);
    } catch (error) {
      console.error('❌ Error general en generateFinalVideo:', error);
      console.error('Stack trace:', error.stack);
      setMessage('Error al generar el video');
      setLoading(false);
    }
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
      const response = await fetch('/api/tiktok-video/generate-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: visualDescription }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate image');
      }

      const data = await response.json();
      return data.imageUrl;
    } catch (error) {
      console.error('Error generating image:', error);
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

      {/* Transition Style Selection */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Estilo de Transición
        </label>
        <select
          value={selectedTransition.value}
          onChange={(e) => {
            const transition = transitionTypes.find(t => t.value === e.target.value);
            if (transition) setSelectedTransition(transition);
          }}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {transitionTypes.map(transition => (
            <option key={transition.value} value={transition.value}>
              {transition.name} - {transition.description}
            </option>
          ))}
        </select>
      </div>

      {/* Subscribe Tag Option - Añadir después del selector de transición */}
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
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
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

        {currentStep === ProcessStep.COMPLETED && (
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

              {/* Video Player */}
              {generatedVideoUrl && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Preview del Video:</h4>
                  <div className="relative aspect-[9/16] w-full max-w-sm mx-auto bg-black rounded-lg overflow-hidden">
                    <video
                      className="w-full h-full"
                      controls
                      src={generatedVideoUrl}
                      poster="/thumbnail-placeholder.jpg"
                    >
                      Tu navegador no soporta la reproducción de video.
                    </video>
                  </div>
                </div>
              )}

              {/* Botón de descarga */}
              <button
                onClick={() => finalVideoBlob && downloadFile(finalVideoBlob, 'video_final.mp4')}
                className="mt-4 w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
              >
                Descargar Video
              </button>
            </div>
          </div>
        )}
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
