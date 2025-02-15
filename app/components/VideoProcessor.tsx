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

const subtitleStyles = [
  {
    name: 'Classic',
    fontsize: 45,
    fontcolor: 'white',
    borderw: 7,
    bordercolor: 'black',
    shadowcolor: 'black@0.8',
    shadowx: 3,
    shadowy: 3,
    y: '(h-text_h)/2', // Centrado vertical
  },
  {
    name: 'TikTok Split',
    fontsize: 50,
    fontcolor: 'white',
    borderw: 8,
    bordercolor: 'black',
    shadowcolor: 'black@0.9',
    shadowx: 4,
    shadowy: 4,
    splitColors: true,
    secondLineColor: 'yellow',
    y: '(h-text_h)/2-30', // Centrado vertical, ajustado para las dos líneas
  }
];

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

  // Cargar la fuente globalmente
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @font-face {
        font-family: 'The Bold Font';
        src: url('/fonts/theboldfontesp.ttf') format('truetype');
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
              return null; // Retornamos null si falla la generación
            });
        });

        const imageUrls = await Promise.all(imagePromises);

        // Actualizamos los segmentos con las URLs de las imágenes
        segmentsWithImages.forEach((segment, index) => {
          segment.imageUrl = imageUrls[index] || undefined;
        });

        setSegments(segmentsWithImages);
        setCurrentStep(ProcessStep.STORY_GENERATED);
        setMessage('Historia e imágenes generadas con éxito!');
        return segmentsWithImages;
      } catch (error) {
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
        const segmentDuration = segment.timeEnd - segment.timeStart;

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

      // Generate all audio files first and get exact durations
      for (let i = 0; i < updatedSegments.length; i++) {
        setProgress(Math.round((i / segments.length) * 25));
        setMessage(`Generando audio ${i + 1} de ${segments.length}...`);
        console.log(`🎵 Generando audio para segmento ${i + 1}...`);

        const audioBlob = await generateAudioForSegment(updatedSegments[i].narration, i);
        const duration = await getAudioDuration(audioBlob);
        console.log(`✓ Audio ${i + 1} generado (duración: ${duration}s)`);

        updatedSegments[i] = {
          ...updatedSegments[i],
          timeStart: currentTime,
          timeEnd: currentTime + duration,
          subSegments: undefined
        };
        currentTime += duration;
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

      let filterComplex = '';

      // Primero creamos los inputs para cada imagen y aplicamos el efecto de zoom a cada una
      for (let i = 0; i < updatedSegments.length; i++) {
        const segment = updatedSegments[i];
        if (!segment.imageUrl) continue;

        const imageResponse = await fetch(segment.imageUrl);
        const imageData = await imageResponse.arrayBuffer();
        await ffmpeg.writeFile(`image_${i}.jpg`, new Uint8Array(imageData));
      }

      // Construir el filter complex para cada segmento
      for (let i = 0; i < updatedSegments.length; i++) {
        // Iteramos por cada segmento para construir su filtro
        // Definimos el input stream para esta imagen
        filterComplex += `[${i}:v]`;
        // Escalamos la imagen a 540x960 manteniendo aspect ratio
        filterComplex += 'scale=540:960:force_original_aspect_ratio=increase,';
        // Recortamos la imagen al tamaño exacto deseado
        filterComplex += 'crop=540:960,';
        // Establecemos fps
        filterComplex += 'fps=10,';
        // Recortamos al tiempo exacto del segmento
        filterComplex += `trim=0:${updatedSegments[i].timeEnd - updatedSegments[i].timeStart},`;
        // Reiniciamos el timestamp para que empiece en 0
        filterComplex += 'setpts=PTS-STARTPTS';
        // Nombramos el output stream para este segmento
        filterComplex += `[v${i}];`;
      }

      // Concatenar todos los segmentos
      for (let i = 0; i < updatedSegments.length; i++) {
        filterComplex += `[v${i}]`;
      }
      filterComplex += `concat=n=${updatedSegments.length}:v=1:a=0[v]`;

      // Construir los argumentos de entrada
      const inputArgs = updatedSegments.map((segment, i) => [
        '-loop', '1',
        '-i', `image_${i}.jpg`  // Removemos -t aquí ya que lo manejamos con trim
      ]).flat();

      // Generar el video base
      await ffmpeg.exec([
        ...inputArgs,
        '-filter_complex', filterComplex,
        '-map', '[v]',
        '-vsync', '1',
        '-pix_fmt', 'yuv420p',
        '-r', '10',
        '-preset', 'ultrafast',
        '-tune', 'fastdecode',
        '-threads', '0',
        '-c:v', 'libx264',
        '-crf', '28',
        '-t', currentTime.toString(),
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
      const fontResponse = await fetch('/fonts/theboldfontesp.ttf');
      const fontData = await fontResponse.arrayBuffer();
      await ffmpeg.writeFile('theboldfontesp.ttf', new Uint8Array(fontData));
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

      // Step 7: Final video generation
      setMessage('Generando video final...');
      console.log('🎥 Comenzando generación del video final...');

      const ffmpegArgs = [
        '-i', 'input.mp4',
        '-i', 'output.mp3',
        '-vf', finalFilter,
        '-c:v', 'libx264',
        '-r', '10',
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-preset', 'ultrafast',
        '-tune', 'zerolatency',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ac', '2',
        '-ar', '44100',
        '-threads', '0',
        '-t', currentTime.toString(), // Usar la duración total exacta
        '-shortest',
        '-async', '1',
        '-vsync', '1',
        '-y',
        'final_output.mp4'
      ];

      console.log('Ejecutando FFmpeg con argumentos:', ffmpegArgs.join(' '));
      await ffmpeg.exec(ffmpegArgs);

      // Step 8: Download final video
      setProgress(95);
      setMessage('Preparando video para descarga...');
      console.log('📥 Preparando descarga...');

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
      console.error('Error detallado:', error);
      setMessage(`Error generando el video: ${error.message}`);
      throw error;
    } finally {
      setLoading(false);
      try {
        await ffmpeg?.terminate();
      } catch (error) {
        console.error('Error terminando FFmpeg:', error);
      }
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
    const fadeInDuration = 0.2; // Duración del fade in en segundos

    if (style.splitColors) {
      // Dividir el texto en dos líneas
      const lines = text.split(' ');
      const midpoint = Math.ceil(lines.length / 2);
      const line1 = lines.slice(0, midpoint).join(' ');
      const line2 = lines.slice(midpoint).join(' ');

      const duration = timeEnd - timeStart;
      const midTime = timeStart + (duration / 2);

      // Función helper para generar la expresión alpha con fade in
      const getAlpha = (t: string) =>
        `alpha='if(lt(${t}-${timeStart},${fadeInDuration}),` +
        `(${t}-${timeStart})/${fadeInDuration},1)'`;

      return [
        // Primera mitad del tiempo - línea 1 amarilla, línea 2 blanca
        `drawtext=fontfile=theboldfontesp.ttf:` +
        `text='${line1}':fontsize=${style.fontsize}:` +
        `fontcolor=yellow:${getAlpha('t')}:borderw=${style.borderw}:` +
        `bordercolor=${style.bordercolor}:shadowcolor=${style.shadowcolor}:` +
        `shadowx=${style.shadowx}:shadowy=${style.shadowy}:` +
        `x=(w-text_w)/2:y=(h-text_h)/2-30:` +
        `enable='between(t,${timeStart},${midTime})'`,

        `drawtext=fontfile=theboldfontesp.ttf:` +
        `text='${line2}':fontsize=${style.fontsize}:` +
        `fontcolor=white:${getAlpha('t')}:borderw=${style.borderw}:` +
        `bordercolor=${style.bordercolor}:shadowcolor=${style.shadowcolor}:` +
        `shadowx=${style.shadowx}:shadowy=${style.shadowy}:` +
        `x=(w-text_w)/2:y=(h-text_h)/2+30:` +
        `enable='between(t,${timeStart},${midTime})'`,

        // Segunda mitad del tiempo - línea 1 blanca, línea 2 amarilla
        `drawtext=fontfile=theboldfontesp.ttf:` +
        `text='${line1}':fontsize=${style.fontsize}:` +
        `fontcolor=white:${getAlpha('t')}:borderw=${style.borderw}:` +
        `bordercolor=${style.bordercolor}:shadowcolor=${style.shadowcolor}:` +
        `shadowx=${style.shadowx}:shadowy=${style.shadowy}:` +
        `x=(w-text_w)/2:y=(h-text_h)/2-30:` +
        `enable='between(t,${midTime},${timeEnd})'`,

        `drawtext=fontfile=theboldfontesp.ttf:` +
        `text='${line2}':fontsize=${style.fontsize}:` +
        `fontcolor=yellow:${getAlpha('t')}:borderw=${style.borderw}:` +
        `bordercolor=${style.bordercolor}:shadowcolor=${style.shadowcolor}:` +
        `shadowx=${style.shadowx}:shadowy=${style.shadowy}:` +
        `x=(w-text_w)/2:y=(h-text_h)/2+30:` +
        `enable='between(t,${midTime},${timeEnd})'`
      ].join(',');
    }

    // Estilo normal con fade in
    return `drawtext=fontfile=theboldfontesp.ttf:` +
           `text='${text}':fontsize=${style.fontsize}:` +
           `fontcolor=${style.fontcolor}:` +
           `alpha='if(lt(t-${timeStart},${fadeInDuration}),` +
           `(t-${timeStart})/${fadeInDuration},1)':` +
           `borderw=${style.borderw}:` +
           `bordercolor=${style.bordercolor}:` +
           `shadowcolor=${style.shadowcolor}:` +
           `shadowx=${style.shadowx}:shadowy=${style.shadowy}:` +
           `x=(w-text_w)/2:y=${style.y}:` +
           `enable='between(t,${timeStart},${timeEnd})'`;
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
            <button
              onClick={() => generateStorySegments(storyPrompt)}
              disabled={loading || !storyPrompt}
              className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              Generar Historia
            </button>
          </div>
        )}

        {currentStep >= ProcessStep.STORY_GENERATED && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold mb-4">Historia Generada</h2>
            <div className="space-y-4">
              {segments.map((segment, index) => (
                <div key={index} className="flex gap-4">
                  {/* Imagen generada */}
                  <div className="w-48 h-48 flex-shrink-0 bg-gray-200 rounded-lg overflow-hidden">
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

                  {/* Contenido del segmento */}
                  <div className="flex-grow">
                    <div className="p-4 border rounded-md bg-gray-50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-blue-600">
                          Segmento {index + 1}
                        </span>
                        <span className="text-sm text-gray-500">
                          {segment.timeStart}s - {segment.timeEnd}s
                        </span>
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


    </div>
  );
}
