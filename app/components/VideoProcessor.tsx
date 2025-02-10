'use client';

import { useState, useEffect } from 'react';
import { OpenAI } from 'openai';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

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
    const openai = new OpenAI({
      apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
      dangerouslyAllowBrowser: true
    });

    const systemPrompt = `Eres un guionista experto. Genera una historia de 60 segundos dividida en 6 segmentos de 10 segundos cada uno. (para la demo actual, creemos solo 1 segmento con 2 frases separadas por un punto)
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

    try {
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

      setSegments(response.segments);
      return response.segments;
    } catch (error) {
      console.error('Error generating story:', error);
      throw new Error('Error al generar la historia: ' + (error.message || 'Error desconocido'));
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

  const generateResources = async () => {
    try {
      setLoading(true);
      setMessage('Iniciando generación de recursos...');

      // Generar audios y obtener sus duraciones
      console.log('🎙️ Generando archivos de audio...');
      const blobs: Blob[] = [];
      let currentTime = 0;
      const updatedSegments = [...segments];

      for (let i = 0; i < segments.length; i++) {
        setProgress(Math.round((i / segments.length) * 100));
        console.log(`Generando audio para segmento ${i + 1}...`);
        const audioBlob = await generateAudioForSegment(segments[i].narration, i);
        const duration = await getAudioDuration(audioBlob);
        console.log(`Duración del audio ${i + 1}: ${duration} segundos`);

        // Actualizar los tiempos del segmento basado en la duración real del audio
        updatedSegments[i] = {
          ...updatedSegments[i],
          timeStart: currentTime,
          timeEnd: currentTime + duration
        };
        currentTime += duration;

        blobs.push(audioBlob);
        downloadFile(audioBlob, `segment_${i + 1}.mp3`);
      }

      // Actualizar los segmentos con los tiempos correctos
      setSegments(updatedSegments);
      setAudioBlobs(blobs);

      // Generar SRT con los tiempos actualizados DESPUÉS de tener todas las duraciones
      console.log('📝 Generando archivo de subtítulos con tiempos reales...');
      const srt = generateSRT(updatedSegments);
      setSrtContent(srt);
      downloadFile(srt, 'subtitles.srt');

      console.log(`Duración total del audio: ${currentTime} segundos`);
      setTotalDuration(currentTime); // Guardar la duración total

      setProgress(100);
      setMessage('¡Recursos generados con éxito!');
      setResourcesGenerated(true);
    } catch (error) {
      console.error('Error generando recursos:', error);
      setMessage(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const generateFinalVideo = async () => {
    if (!ffmpeg) {
      setMessage('FFmpeg no está inicializado');
      return;
    }

    try {
      setLoading(true);
      setMessage('Iniciando generación del video final...');
      console.log('🎬 Comenzando proceso de video final');

      // Set up logging
      ffmpeg.on('log', ({ message }) => {
        console.log('FFmpeg Log:', message);
      });

      ffmpeg.on('progress', ({ progress }) => {
        const percentage = Math.round(progress * 100);
        console.log(`Progress: ${percentage}%`);
        setProgress(percentage);
        setMessage(`Procesando video: ${percentage}%`);
      });

      // Cargar video de fondo
      setProgress(10);
      console.log('📼 Cargando video de Minecraft...');
      const videoResponse = await fetch('/videos/minecraft-vertical.mp4');
      const videoData = await videoResponse.arrayBuffer();
      await ffmpeg.writeFile('input.mp4', new Uint8Array(videoData));

      // Cargar audios
      setProgress(20);
      console.log('🔊 Cargando archivos de audio...');
      for (let i = 0; i < audioBlobs.length; i++) {
        const arrayBuffer = await audioBlobs[i].arrayBuffer();
        await ffmpeg.writeFile(`segment_${i}.mp3`, new Uint8Array(arrayBuffer));
      }

      // Crear archivo de concatenación
      setProgress(30);
      console.log('📝 Preparando concatenación de audio...');
      const concatFile = audioBlobs.map((_, i) => `file 'segment_${i}.mp3'`).join('\n');
      await ffmpeg.writeFile('concat.txt', concatFile);

      // Concatenar audios
      setProgress(40);
      setMessage('Combinando audios...');
      await ffmpeg.exec([
        '-f', 'concat',
        '-safe', '0',
        '-i', 'concat.txt',
        '-c', 'copy',
        'output.mp3'
      ]);

      // Generar el filtro de texto para cada subsegmento
      const textFilters = segments.flatMap(segment =>
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

      // Cargar la fuente
      const fontResponse = await fetch('/fonts/theboldfontesp.ttf');
      const fontData = await fontResponse.arrayBuffer();
      await ffmpeg.writeFile('theboldfontesp.ttf', new Uint8Array(fontData));

      console.log('🎥 Combinando video, audio y subtítulos...');
      console.log('Filtros de texto:', textFilters);

      await ffmpeg.exec([
        '-i', 'input.mp4',          // Entrada del video original
        '-i', 'output.mp3',         // Entrada del audio concatenado
        '-vf', textFilters,         // Aplica los filtros de texto (subtítulos)
        '-c:v', 'libx264',          // Codec de video H.264
        '-map', '0:v:0', // Usa el video de input.mp4
        '-map', '1:a:0', // Usa el audio de output.mp3

        '-preset', 'ultrafast',      // Configuración de velocidad de codificación
        '-tune', 'zerolatency',     // Optimiza para baja latencia
        '-c:a', 'aac',              // Codec de audio AAC
        '-b:a', '128k',             // Bitrate de audio 128kbps
        '-ac', '2',                 // 2 canales de audio (estéreo)
        '-ar', '44100',             // Frecuencia de muestreo de audio 44.1kHz
        '-threads', '0',            // Usa todos los hilos disponibles
        '-t', segments[segments.length - 1].timeEnd.toString(), // Duración total del video
        '-shortest',                // Termina cuando el stream más corto acabe
        '-progress', 'pipe:1',      // Muestra el progreso en la salida
        '-y',                       // Sobrescribe archivo si existe
        'final_output.mp4'          // Archivo de salida final
      ]);

      // Descargar video final
      setProgress(95);
      setMessage('Descargando video final...');
      const data = await ffmpeg.readFile('final_output.mp4');
      const blob = new Blob([data], { type: 'video/mp4' });
      downloadFile(blob, 'video_final.mp4');

      setProgress(100);
      setMessage('¡Video final generado con éxito!');
    } catch (error) {
      console.error('Error generando video final:', error);
      setMessage(`Error: ${error.message}`);
    } finally {
      setLoading(false);
      setProgress(0);
      try {
        await ffmpeg.terminate();
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

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      {/* Paso 1: Generar Historia */}
      <div className="border rounded-lg p-6 bg-white shadow-sm">
        <h2 className="text-xl font-bold mb-4">Generador de Historia</h2>
        <div className="space-y-4">
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
            onClick={async () => {
              try {
                setLoading(true);
                setMessage('Generando historia...');
                await generateStorySegments(storyPrompt);
                setMessage('Historia generada con éxito!');
              } catch (error) {
                setMessage(`Error: ${error.message}`);
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading || !storyPrompt}
            className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            Generar Historia
          </button>
        </div>
      </div>

      {/* Preview de la Historia */}
      {segments.length > 0 && (
        <div className="border rounded-lg p-6 bg-white shadow-sm">
          <h2 className="text-xl font-bold mb-4">Historia Generada</h2>
          <div className="space-y-4">
            {segments.map((segment, index) => (
              <div key={index} className="p-4 border rounded-md bg-gray-50">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-blue-600">
                    Segmento {index + 1}
                  </span>
                  <span className="text-sm text-gray-500">
                    {segment.timeStart}s - {segment.timeEnd}s
                  </span>
                </div>
                <div className="space-y-2">
                  <div>
                    <h4 className="text-sm font-medium text-gray-700">Narración:</h4>
                    <p className="text-sm text-gray-600 bg-white p-2 rounded">
                      {segment.narration}
                    </p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-700">Descripción Visual:</h4>
                    <p className="text-sm text-gray-500 italic bg-white p-2 rounded">
                      {segment.visualDescription}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 space-y-4">
            <button
              onClick={generateResources}
              disabled={loading}
              className="w-full py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? 'Generando recursos...' : 'Generar Audio y Subtítulos'}
            </button>

            {resourcesGenerated && (
              <button
                onClick={generateFinalVideo}
                disabled={loading}
                className="w-full py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {loading ? 'Generando video...' : 'Generar Video Final'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Mensaje de Estado con Barra de Progreso */}
      {message && (
        <div className={`mt-4 p-4 border rounded-md ${loading ? 'bg-blue-50' : 'bg-gray-50'}`}>
          <div className="flex items-center space-x-3">
            {loading && (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            )}
            <p className="text-sm text-gray-700">{message}</p>
          </div>
          {loading && progress > 0 && (
            <div className="mt-2 w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
