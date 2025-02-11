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

  // Inicializar FFmpeg cuando el componente se monta
  useEffect(() => {
    const loadFFmpeg = async () => {
      try {
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
      } catch (error) {
        console.error('❌ Error cargando FFmpeg:', error);
        setMessage('Error inicializando el procesador de video');
      }
    };

    loadFFmpeg();
  }, []);

  const generateStorySegments = async (prompt: string) => {
    try {
      setLoading(true);
      setMessage('Generando historia...');

      // Primero generamos la historia con GPT
      const openai = new OpenAI({
        apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
        dangerouslyAllowBrowser: true
      });

      const systemPrompt = `Eres un guionista experto. Genera una historia de 60 segundos dividida en 6 segmentos de 10 segundos cada uno. (para la demo actual, creemos solo 2 segmentos)
      La historia debe estar basada en el siguiente prompt del usuario: "${prompt}".

      Reglas importantes:
      - Cada segmento debe durar exactamente 10 segundos
      - La narración debe ser concisa y natural para caber en 10 segundos
      - La descripción visual debe ser clara y realizable
      - La historia debe tener un arco narrativo completo

      Devuelve SOLO un JSON con el siguiente formato exacto:
      {
        "segments": [
          {
            "timeStart": 0,
            "timeEnd": 10,
            "narration": "texto para narrar en voz en off (10 segundos)",
            "visualDescription": "descripción de lo que se ve en pantalla"
          }
        ]
      }`;

      const completion = await openai.chat.completions.create({
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: prompt
          }
        ],
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        temperature: 1,
      });

      const response = JSON.parse(completion.choices[0].message.content);
      if (!response.segments || !Array.isArray(response.segments)) {
        throw new Error('Formato de respuesta inválido');
      }

      // Ahora generamos las imágenes para cada segmento
      setMessage('Generando imágenes para la historia...');
      const segmentsWithImages = [...response.segments];

      for (let i = 0; i < segmentsWithImages.length; i++) {
        setMessage(`Generando imagen ${i + 1} de ${segmentsWithImages.length}...`);
        try {
          const imageUrl = await generateImageForSegment(segmentsWithImages[i].visualDescription);
          segmentsWithImages[i] = {
            ...segmentsWithImages[i],
            imageUrl
          };
        } catch (error) {
          console.error(`Error generando imagen para segmento ${i}:`, error);
          // Continuamos con el siguiente segmento si hay error
        }
      }

      setSegments(segmentsWithImages);
      setCurrentStep(ProcessStep.STORY_GENERATED);
      setMessage('Historia e imágenes generadas con éxito!');
      return segmentsWithImages;
    } catch (error) {
      console.error('Error generating story:', error);
      throw new Error('Error al generar la historia: ' + (error.message || 'Error desconocido'));
    } finally {
      setLoading(false);
    }
  };

  const generateAudioForSegment = async (text: string, index: number) => {
    const openai = new OpenAI({
      apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
      dangerouslyAllowBrowser: true
    });

    try {
      const mp3 = await openai.audio.speech.create({
        model: "tts-1",
        voice: "alloy",
        input: text,
      });

      const blob = new Blob([await mp3.arrayBuffer()], { type: 'audio/mpeg' });
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
        const durationPerSentence = segmentDuration / sentences.length;

        sentences.forEach((sentence, sentenceIndex) => {
          const words = sentence.trim().split(' ');
          const wordsPerSubSegment = 3;
          const durationPerWord = durationPerSentence / words.length;

          for (let i = 0; i < words.length; i += wordsPerSubSegment) {
            const subSegmentWords = words.slice(i, i + wordsPerSubSegment);
            const timeStart = segment.timeStart +
                            (sentenceIndex * durationPerSentence) +
                            (i * durationPerWord);
            const timeEnd = timeStart + (subSegmentWords.length * durationPerWord);

            if (subSegmentWords.length > 0) {
              subSegments.push({
                timeStart,
                timeEnd,
                text: normalizeText(subSegmentWords.join(' '))
              });
            }
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

  const generateFinalVideo = async () => {
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

      // Crear un archivo de entrada para concatenar las imágenes con duraciones exactas
      let inputFileContent = '';
      for (let i = 0; i < updatedSegments.length; i++) {
        const segment = updatedSegments[i];
        if (!segment.imageUrl) continue;

        const imageResponse = await fetch(segment.imageUrl);
        const imageData = await imageResponse.arrayBuffer();
        await ffmpeg.writeFile(`image_${i}.jpg`, new Uint8Array(imageData));

        const exactDuration = segment.timeEnd - segment.timeStart;
        console.log(`Imagen ${i + 1}: duración=${exactDuration}s (${segment.timeStart}s - ${segment.timeEnd}s)`);

        // Asegurarnos de que la duración es precisa
        inputFileContent += `file 'image_${i}.jpg'\nduration ${exactDuration.toFixed(6)}\n`;
      }
      // Repetir la última imagen por un frame
      inputFileContent += `file 'image_${updatedSegments.length - 1}.jpg'\nduration 0.033\n`;

      await ffmpeg.writeFile('image_list.txt', inputFileContent);
      console.log('Contenido del archivo de imágenes:', inputFileContent);

      // Generar video base con framerate consistente
      await ffmpeg.exec([
        '-f', 'concat',
        '-safe', '0',
        '-i', 'image_list.txt',
        '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30',
        '-vsync', '1', // Sincronización de video más estricta
        '-pix_fmt', 'yuv420p',
        '-r', '30',
        'input.mp4'
      ]);

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
          const normalizedText = normalizeText(subSegment.text);
          return `drawtext=fontfile=theboldfontesp.ttf:` +
                 `text='${normalizedText}':` +
                 `fontsize=80:` +
                 `fontcolor=white:` +
                 `borderw=8:` +
                 `bordercolor=black:` +
                 `shadowcolor=black@0.8:` +
                 `shadowx=3:` +
                 `shadowy=3:` +
                 `x=(w-text_w)/2:` +
                 `y=(h-text_h)/2:` +
                 `enable='between(t,${subSegment.timeStart},${subSegment.timeEnd})':` +
                 `alpha='if(lt(t,${subSegment.timeStart}+0.05),t-${subSegment.timeStart},1)'`;
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
        '-r', '30',
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-preset', 'ultrafast',
        '-tune', 'zerolatency',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ac', '2',
        '-ar', '44100',
        '-threads', '0',
        '-t', updatedSegments[updatedSegments.length - 1].timeEnd.toString(),
        '-shortest',
        '-async', '1',
        '-vsync', '1',
        '-progress', 'pipe:1',
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
      console.error('❌ Error en el proceso:', error);
      console.error('Detalles del error:', error.message);
      setMessage(`Error: ${error.message}`);
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
      const response = await fetch('/api/generate-image', {
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
              <button
                onClick={generateFinalVideo}
                disabled={loading}
                className="w-full py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                Generar Video
              </button>
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
                Descargar Video Nuevamente
              </button>
            </div>
          </div>
        )}
      </div>


    </div>
  );
}
