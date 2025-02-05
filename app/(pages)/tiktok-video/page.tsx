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
      console.log('=== Starting video generation process ===');
      console.log('Initial state:', {
        scriptSegmentsCount: scriptSegments.length,
        currentStep,
        isGenerating
      });

      setIsGenerating(true);
      setProgress(0);
      setErrorMessage(null);

      console.log('Creating new FFmpeg instance...');
      const ffmpeg = new FFmpeg();

      // Cargar FFmpeg con mejor manejo de errores
      try {
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
        console.log('Loading FFmpeg from:', baseURL);

        const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');
        const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm');
        console.log('Blob URLs created:', { coreURL, wasmURL });

        await ffmpeg.load({
          coreURL,
          wasmURL,
        });
        console.log('✅ FFmpeg loaded successfully');
      } catch (loadError) {
        console.error('❌ Error loading FFmpeg:', loadError);
        console.error('Load error details:', {
          name: loadError.name,
          message: loadError.message,
          stack: loadError.stack
        });
        throw new Error('Failed to load FFmpeg');
      }

      // Crear archivos temporales con mejor manejo de errores
      console.log(`Starting to process ${scriptSegments.length} segments...`);
      for (let i = 0; i < scriptSegments.length; i++) {
        try {
          console.log(`\n=== Processing segment ${i + 1}/${scriptSegments.length} ===`);
          console.log('Segment data:', {
            text: scriptSegments[i].text,
            imageUrl: scriptSegments[i].image,
            audioUrl: scriptSegments[i].audioUrl
          });

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

          setProgress((i + 1) * 30 / scriptSegments.length);
          console.log(`Progress updated: ${(i + 1) * 30 / scriptSegments.length}%`);
        } catch (segmentError) {
          console.error(`❌ Error processing segment ${i}:`, segmentError);
          console.error('Segment error details:', {
            name: segmentError.name,
            message: segmentError.message,
            stack: segmentError.stack
          });
          throw new Error(`Failed to process media segment ${i}`);
        }
      }

      // Primero creamos un video para cada segmento
      for (let i = 0; i < scriptSegments.length; i++) {
        const duration = scriptSegments[i].duration;
        console.log(`Creating video segment ${i} with duration: ${duration}s`);

        // Comando simplificado con parámetros adicionales
        const segmentCommand = [
          '-y',                     // Sobrescribir archivo si existe
          '-loop', '1',            // Repetir imagen
          '-i', `image${i}.jpg`,   // Input imagen
          '-i', `audio${i}.mp3`,   // Input audio
          '-t', duration.toString(), // Duración explícita
          '-vf', 'scale=1080:1920', // Escalar a resolución TikTok
          '-preset', 'ultrafast',   // Codificación más rápida
          '-tune', 'stillimage',    // Optimizar para imágenes estáticas
          '-c:v', 'libx264',       // Codec de video
          '-c:a', 'copy',          // Copiar audio sin recodificar
          '-pix_fmt', 'yuv420p',   // Formato de pixel compatible
          '-movflags', '+faststart', // Optimizar para streaming
          `temp${i}.mp4`
        ];

        console.log(`Executing command for segment ${i}:`, segmentCommand.join(' '));
        try {
          await ffmpeg.exec(segmentCommand);
          console.log(`✅ Created video segment ${i}`);

          // Verificar que el archivo se creó
          const files = await ffmpeg.listDir('/');
          console.log(`Files after segment ${i}:`, files);
        } catch (error) {
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
      setProgress(100);
      setCurrentStep(3);
      console.log('✅ Video generation completed successfully');

    } catch (error) {
      console.error('Error generating video:', error);
      setErrorMessage(`Error al generar el video: ${error.message}`);
    } finally {
      setIsGenerating(false);
      console.log('=== Video generation process ended ===');
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
              {isGenerating ? `Generating... ${progress}%` : 'Generate Video'}
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
