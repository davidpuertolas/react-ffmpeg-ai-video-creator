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
  text: string;
  image: string;
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

  const handleScriptGeneration = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
    setIsGenerating(true);

      // Buscar 3 imágenes diferentes en Pexels
      const queries = ['nature landscape', 'city night', 'ocean sunset'];
      const images = await Promise.all(queries.map(query => searchPexelsImage(query)));

      const demoSegments: ScriptSegment[] = images.map((image, index) => ({
        text: `Segment ${index + 1}`,
        image: image || `https://images.pexels.com/photos/${1000000 + index}/pexels-photo-${1000000 + index}.jpeg`,
      }));

      setScriptSegments(demoSegments);
      setCurrentStep(2);
    } catch (error) {
      console.error('Error generating segments:', error);
      setErrorMessage('Error al obtener las imágenes. Por favor, intenta de nuevo.');
    } finally {
      setIsGenerating(false);
    }
  };

  const generateVideo = async () => {
    try {
      setIsGenerating(true);
      setProgress(0);
      setErrorMessage(null);

      // 1. Cargar FFmpeg
      const ffmpeg = new FFmpeg();
      console.log('Loading FFmpeg...');

      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });

      // 2. Descargar y escribir las imágenes
      console.log('Writing images...');
      for (let i = 0; i < scriptSegments.length; i++) {
        const response = await fetch(scriptSegments[i].image);
        const imageData = await response.arrayBuffer();
        await ffmpeg.writeFile(`image${i}.jpg`, new Uint8Array(imageData));
        setProgress((i + 1) * 30 / scriptSegments.length);
      }

      // 3. Crear archivo de concatenación con duración exacta
      const concatContent = scriptSegments
        .map((_, i) => `file 'image${i}.jpg'\nduration 5.0\n`)
        .join('') +
        // La última imagen necesita una duración explícita
        `file 'image${scriptSegments.length - 1}.jpg'\nduration 5.0`;

      await ffmpeg.writeFile('concat.txt', concatContent);
      setProgress(40);

      // 4. Generar video con framerate específico y duración exacta
      console.log('Generating video...');
      await ffmpeg.exec([
        '-f', 'concat',
        '-safe', '0',
        '-i', 'concat.txt',
        '-vsync', 'vfr',
        '-pix_fmt', 'yuv420p',
        '-r', '30',
        '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2',
        'output.mp4'
      ]);
      setProgress(80);

      // 5. Leer el archivo de salida
        const data = await ffmpeg.readFile('output.mp4');
      const videoBlob = new Blob([data.buffer], { type: 'video/mp4' });
      const videoUrl = URL.createObjectURL(videoBlob);

      setFinalVideo(videoUrl);
        setProgress(100);
      setCurrentStep(3);

    } catch (error) {
      console.error('Error generating video:', error);
      setErrorMessage('Error al generar el video. Por favor, intenta de nuevo.');
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
