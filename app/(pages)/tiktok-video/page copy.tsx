"use client";

import { useState, useRef } from "react";
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

const steps = [
  { id: 1, name: "Script" },
  { id: 2, name: "Preview" },
  { id: 3, name: "Generate" },
];

interface ScriptSegment {
  text: string;          // Texto para los subtítulos y TTS
  image: string;         // URL de la imagen de fondo
  audioUrl?: string;     // URL del audio generado
  duration?: number;     // Duración del audio
}

export default function TikTokVideoPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [scriptSegments, setScriptSegments] = useState<ScriptSegment[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [topic, setTopic] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const [finalVideo, setFinalVideo] = useState<string | null>(null);

const searchPexelsImage = async (query: string) => {
  try {
    const response = await fetch(`/api/pexels?query=${encodeURIComponent(query)}`);
    if (!response.ok) {
      throw new Error('Failed to fetch from Pexels API');
    }
    const data = await response.json();
      return data.photos[0]?.src?.portrait || null;
  } catch (error) {
      console.error('Error fetching image:', error);
      return null;
    }
  };

  const generateScript = async (topic: string) => {
    try {
      const response = await fetch('/api/generate-script', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ topic }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate script');
      }

      const segments = await response.json();
      return segments;
    } catch (error) {
      console.error('Error generating script:', error);
      throw error;
    }
  };

  const getAudioDuration = async (audioBlob: Blob): Promise<number> => {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      audio.src = URL.createObjectURL(audioBlob);
      audio.onloadedmetadata = () => {
        URL.revokeObjectURL(audio.src);
        resolve(audio.duration);
      };
      audio.onerror = reject;
    });
  };

  const handleScriptGeneration = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsGenerating(true);
      setErrorMessage(null);

      // 1. Generar el script con OpenAI
      const scriptData = await generateScript(topic);

      // 2. Para cada segmento, buscar imagen y generar audio
      const segmentsWithMedia = await Promise.all(
        scriptData.map(async (segment: { text: string, imagePrompt: string }) => {
          // Buscar imagen en Pexels
          const image = await searchPexelsImage(segment.imagePrompt);

          // Generar audio con OpenAI TTS
          const audioResponse = await fetch('/api/generate-speech', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text: segment.text }),
          });

          const audioBlob = await audioResponse.blob();
          const duration = await getAudioDuration(audioBlob);
          const audioUrl = URL.createObjectURL(audioBlob);

          return {
            text: segment.text,
            image: image || 'default-image-url',
            audioUrl,
            duration,
          };
        })
      );

      setScriptSegments(segmentsWithMedia);
      setCurrentStep(2);
    } catch (error) {
      console.error('Error generating segments:', error);
      setErrorMessage('Error al generar el contenido. Por favor, intenta de nuevo.');
    } finally {
      setIsGenerating(false);
    }
  };

  const generateVideo = async () => {
    try {
      setIsGenerating(true);
      setProgress(0);
      setErrorMessage(null);

      // Calcular los pesos de cada fase
      const totalSegments = scriptSegments.length;
      const PROGRESS_WEIGHTS = {
        LOAD_FFMPEG: 10,        // 10% para cargar FFmpeg
        PROCESS_FILES: 30,      // 30% para procesar archivos
        CREATE_SEGMENTS: 40,    // 40% para crear segmentos
        FINAL_CONCAT: 20        // 20% para concatenación final
      };

      // Función helper para actualizar el progreso
      const updateProgress = (phase: string, current: number, total: number, weight: number) => {
        const baseProgress = {
          'LOAD_FFMPEG': 0,
          'PROCESS_FILES': PROGRESS_WEIGHTS.LOAD_FFMPEG,
          'CREATE_SEGMENTS': PROGRESS_WEIGHTS.LOAD_FFMPEG + PROGRESS_WEIGHTS.PROCESS_FILES,
          'FINAL_CONCAT': PROGRESS_WEIGHTS.LOAD_FFMPEG + PROGRESS_WEIGHTS.PROCESS_FILES + PROGRESS_WEIGHTS.CREATE_SEGMENTS
        }[phase];

        const progress = baseProgress + (current / total) * weight;
        setProgress(Math.round(progress));
        console.log(`Progress: ${Math.round(progress)}%`);
      };

      // Cargar FFmpeg
      console.log('Loading FFmpeg...');
      const ffmpeg = new FFmpeg();
      try {
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        updateProgress('LOAD_FFMPEG', 1, 1, PROGRESS_WEIGHTS.LOAD_FFMPEG);
      } catch (loadError) {
        throw new Error('Failed to load FFmpeg');
      }

      // Procesar archivos
      for (let i = 0; i < scriptSegments.length; i++) {
        // Procesar imagen
        console.log(`Fetching image for segment ${i}...`);
        const imageResponse = await fetch(scriptSegments[i].image);
        console.log('Image fetch response:', {
          ok: imageResponse.ok,
          status: imageResponse.status,
          contentType: imageResponse.headers.get('content-type'),
          contentLength: imageResponse.headers.get('content-length')
        });

        if (!imageResponse.ok) throw new Error(`Failed to fetch image ${i}: ${imageResponse.status}`);

        const imageData = await imageResponse.arrayBuffer();
        console.log(`Image data received: ${imageData.byteLength} bytes`);

        const imageFileName = `image${i}.jpg`;
        await ffmpeg.writeFile(imageFileName, new Uint8Array(imageData));
        console.log(`✅ Written image file: ${imageFileName}`);

        // Procesar audio
        console.log(`Fetching audio for segment ${i}...`);
        const audioResponse = await fetch(scriptSegments[i].audioUrl!);
        console.log('Audio fetch response:', {
          ok: audioResponse.ok,
          status: audioResponse.status,
          contentType: audioResponse.headers.get('content-type'),
          contentLength: audioResponse.headers.get('content-length')
        });

        if (!audioResponse.ok) throw new Error(`Failed to fetch audio ${i}: ${audioResponse.status}`);

        const audioData = await audioResponse.arrayBuffer();
        console.log(`Audio data received: ${audioData.byteLength} bytes`);

        const audioFileName = `audio${i}.mp3`;
        await ffmpeg.writeFile(audioFileName, new Uint8Array(audioData));
        console.log(`✅ Written audio file: ${audioFileName}`);

        updateProgress('PROCESS_FILES', i + 1, totalSegments, PROGRESS_WEIGHTS.PROCESS_FILES);
      }

      // Crear segmentos de video
      for (let i = 0; i < scriptSegments.length; i++) {
        const duration = scriptSegments[i].duration;
        console.log(`Creating video segment ${i + 1}/${totalSegments}`);

        // Calcular el rango de progreso para este segmento
        const progressPerSegment = (95 - 40) / totalSegments;
        const segmentStartProgress = 40 + (i * progressPerSegment);
        const segmentEndProgress = 40 + ((i + 1) * progressPerSegment);

        // Estimamos que la codificación toma aproximadamente el doble del tiempo de duración del video
        const estimatedEncodingTime = duration * 2 * 1000; // convertir a milisegundos
        const startTime = Date.now();

        // Comando simplificado con parámetros adicionales
        const segmentCommand = [
          '-y',
          '-loop', '1',
          '-i', `image${i}.jpg`,
          '-i', `audio${i}.mp3`,
          '-t', duration.toString(),
          '-vf', 'scale=1080:1920',
          '-preset', 'ultrafast',
          '-tune', 'stillimage',
          '-c:v', 'libx264',
          '-c:a', 'copy',
          '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart',
          `temp${i}.mp4`
        ];

        console.log(`Executing command for segment ${i}:`, segmentCommand.join(' '));
        console.log(`Progress range for segment ${i}: ${segmentStartProgress}% - ${segmentEndProgress}%`);

        // Iniciar un intervalo para actualizar el progreso
        const progressInterval = setInterval(() => {
          const elapsedTime = Date.now() - startTime;
          const segmentProgress = Math.min((elapsedTime / estimatedEncodingTime) * 100, 99);

          // Mapear el progreso de 0-100 al rango de este segmento
          const mappedProgress = segmentStartProgress + (segmentProgress * (progressPerSegment) / 100);

          setProgress(Math.round(mappedProgress));
          console.log(`Encoding progress for segment ${i}: ${Math.round(mappedProgress)}%`);
        }, 100);

        try {
          await ffmpeg.exec(segmentCommand);
          clearInterval(progressInterval);
          console.log(`✅ Created video segment ${i}`);
          setProgress(Math.round(segmentEndProgress)); // Asegurar que llegue al final del rango de este segmento

          const files = await ffmpeg.listDir('/');
          console.log(`Files after segment ${i}:`, files);
        } catch (error) {
          clearInterval(progressInterval);
          console.error(`Error creating segment ${i}:`, error);
          throw error;
        }
      }

      // Crear lista de videos para concatenar
      const videoList = scriptSegments
        .map((_, i) => `file temp${i}.mp4`)
        .join('\n');

      console.log('Creating video list:', videoList);
      await ffmpeg.writeFile('videolist.txt', videoList);

      // Concatenación final con progreso gradual
      console.log('Starting final concatenation (95% - 100%)');
      let currentProgress = 95;

      const finalProgressInterval = setInterval(() => {
        if (currentProgress < 99) {
          currentProgress += 0.1; // Incrementar 0.1% cada segundo (10 segundos por 1%)
          setProgress(Math.round(currentProgress));
        }
      }, 1000);

      try {
        // Comando final para concatenar
        const finalCommand = [
          '-y',
          '-f', 'concat',
          '-safe', '0',
          '-i', 'videolist.txt',
          '-c', 'copy',
          'output.mp4'
        ];

        console.log('Executing final command:', finalCommand.join(' '));
        await ffmpeg.exec(finalCommand);
        clearInterval(finalProgressInterval);
        setProgress(100); // Asegurar que llegue al 100%

        // Leer el archivo de salida
        console.log('Reading output file...');
        const data = await ffmpeg.readFile('output.mp4');
        console.log(`Output file size: ${data.buffer.byteLength} bytes`);

        if (!data || data.buffer.byteLength === 0) {
          throw new Error('Output file is empty or not generated');
        }

        const videoBlob = new Blob([data.buffer], { type: 'video/mp4' });
        console.log(`Video blob created: ${videoBlob.size} bytes`);

        const videoUrl = URL.createObjectURL(videoBlob);
        console.log('Video URL created:', videoUrl);

        setFinalVideo(videoUrl);
        setCurrentStep(3);
        console.log('✅ Video generation completed successfully');

      } catch (error) {
        clearInterval(finalProgressInterval);
        throw error;
      }

    } catch (error) {
      console.error('Error generating video:', error);
      setErrorMessage(`Error al generar el video: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (finalVideo) {
      const a = document.createElement('a');
      a.href = finalVideo;
      a.download = `video-${Date.now()}.mp4`;
      a.click();
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {errorMessage && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4">
          {errorMessage}
        </div>
      )}

      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-center">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                ${currentStep >= step.id ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"}`}>
                {step.id}
              </div>
              <div className={`text-sm font-medium mx-2
                ${currentStep >= step.id ? "text-gray-900" : "text-gray-500"}`}>
                {step.name}
              </div>
              {index < steps.length - 1 && (
                <div className={`w-20 h-0.5 mx-2 ${currentStep > step.id ? "bg-blue-600" : "bg-gray-200"}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step 1: Input */}
      {currentStep === 1 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold mb-4">Create Video</h2>
          <form onSubmit={handleScriptGeneration} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Video Topic
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700"
            >
              Continue
            </button>
          </form>
        </div>
      )}

      {/* Step 2: Preview */}
      {currentStep === 2 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold mb-4">Preview Images</h2>
          <div className="space-y-4">
            {scriptSegments.map((segment, index) => (
              <div key={index} className="border rounded-lg p-4">
                <img
                  src={segment.image}
                  alt={`Segment ${index + 1}`}
                  className="w-full aspect-[9/16] object-cover rounded-lg"
                />
                <p className="mt-2 text-sm text-gray-600">{segment.text}</p>
              </div>
            ))}
            <button
              onClick={generateVideo}
              disabled={isGenerating}
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {isGenerating ? (
                <div className="flex items-center justify-center space-x-2">
                  <span>Generating... {progress}%</span>
                  <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 max-w-[200px]">
                    <div
                      className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                </div>
              ) : (
                'Generate Video'
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Final Video */}
      {currentStep === 3 && finalVideo && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold mb-4">Final Video</h2>
          <div className="space-y-4">
                <video
              src={finalVideo}
                  controls
              className="w-full aspect-[9/16] bg-black rounded-lg"
            />
            <button
              onClick={handleDownload}
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700"
            >
              Download Video
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
