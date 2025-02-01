"use client";

import { useState, useEffect, useRef } from "react";
import { ArrowRightIcon } from "@heroicons/react/24/outline";
import OpenAI from 'openai';
import html2canvas from 'html2canvas';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

const steps = [
  { id: 1, name: "Prompt" },
  { id: 2, name: "Preview" },
  { id: 3, name: "Customize" },
  { id: 4, name: "Generate" },
];

// Estructura del video generado por GPT
interface VideoStructure {
  scenes: {
    text: string;
    imagePrompt: string;
    duration: number;
    voicePrompt: string;
  }[];
  totalDuration: number;
  title: string;
}

// Inicializar OpenAI
const openai = new OpenAI({
  apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
});

// Voces disponibles
const VOICE_OPTIONS = [
  { id: 'alloy', name: 'Neutral', demo: '/voices/alloy.wav' },
  { id: 'echo', name: 'Radio Host', demo: '/voices/echo.wav' },
  { id: 'fable', name: 'Storyteller', demo: '/voices/fable.wav' },
  { id: 'onyx', name: 'News Anchor', demo: '/voices/onyx.wav' },
];

// Opciones de música
const MUSIC_OPTIONS = [
  { id: 'tense', name: 'Tense', src: '/songs/tense.mp3' },
  { id: 'storytelling', name: 'Storytelling', src: '/songs/storytelling.mp3' }
];

// Añade esta función auxiliar al inicio
const getAudioDuration = (audioBlob: Blob): Promise<number> => {
  return new Promise((resolve) => {
    const audio = new Audio(URL.createObjectURL(audioBlob));
    audio.addEventListener('loadedmetadata', () => {
      resolve(audio.duration);
    });
  });
};

export default function VideoGeneratorPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [videoStructure, setVideoStructure] = useState<VideoStructure | null>(null);
  const [selectedVoice, setSelectedVoice] = useState('alloy');
  const [selectedMusic, setSelectedMusic] = useState('tense');
  const [sceneImages, setSceneImages] = useState<string[]>([]);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);

  // Función para generar la estructura del video con GPT-4
  const generateVideoStructure = async (userPrompt: string) => {
    try {
      console.log('🎬 Generating video structure for prompt:', userPrompt);

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{
          role: "system",
          content: "You are a video structure generator. Generate a JSON (only 2 entries) response with the following structure for a video:\n" +
            "{\n" +
            "  \"scenes\": [{\n" +
            "    \"text\": \"Scene description text\",\n" +
            "    \"imagePrompt\": \"Image description for Pexels\",\n" +
            "    \"duration\": 5,\n" +
            "    \"voicePrompt\": \"Text to be spoken\"\n" +
            "  }],\n" +
            "  \"totalDuration\": 30,\n" +
            "  \"title\": \"Video title\"\n" +
            "}"
        }, {
          role: "user",
          content: userPrompt
        }],
        response_format: { type: "json_object" }
      });

      console.log('✅ GPT Response:', completion.choices[0].message.content);

      const structure = JSON.parse(completion.choices[0].message.content);
      return structure as VideoStructure;
    } catch (error) {
      console.error('❌ Error in generateVideoStructure:', error);
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      throw error;
    }
  };

  // Función para obtener imágenes de Pexels usando API Routes
  const getSceneImages = async (imagePrompts: string[]) => {
    try {
      console.log('🖼️ Fetching images for prompts:', imagePrompts);

      const images = await Promise.all(imagePrompts.map(async (prompt) => {
        console.log('📸 Fetching image for prompt:', prompt);

        const response = await fetch('/api/pexels', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: prompt })
        });

        console.log('📡 Pexels API response status:', response.status);

        if (!response.ok) {
          console.error('❌ Failed to fetch image. Status:', response.status);
          throw new Error(`Failed to fetch image. Status: ${response.status}`);
        }

        const data = await response.json();
        console.log('📦 Pexels API response data:', data);

        return data.photos[0]?.src.large || '';
      }));

      console.log('✅ All images fetched:', images);
      return images;
    } catch (error) {
      console.error('❌ Error in getSceneImages:', error);
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      throw error;
    }
  };

  // Manejar el envío del prompt
  const handlePromptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // 1. Generar estructura con GPT-4
      const structure = await generateVideoStructure(prompt);
      setVideoStructure(structure);

      // 2. Obtener imágenes de Pexels
      const images = await getSceneImages(structure.scenes.map(scene => scene.imagePrompt));
      setSceneImages(images);

      setCurrentStep(2);
    } catch (error) {
      console.error('Error:', error);
      alert('Error generating video structure. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateVideo = async () => {
    try {
      console.log('🎬 Starting video generation process...');
      setIsGenerating(true);
      setProgress(0);
      setCurrentStep(4);

      // 1. Generate audio for each scene
      const audioSegments = [];
      console.log('🎙️ Starting audio generation for scenes...');

      for (let i = 0; i < videoStructure!.scenes.length; i++) {
        const scene = videoStructure!.scenes[i];
        console.log(`📝 Generating audio for scene ${i + 1}/${videoStructure!.scenes.length}`);
        console.log('Scene text:', scene.voicePrompt);

        try {
          const audioResponse = await openai.audio.speech.create({
            model: "tts-1",
            voice: selectedVoice,
            input: scene.voicePrompt,
          });

          const audioBlob = await audioResponse.blob();
          const duration = await getAudioDuration(audioBlob);

          audioSegments.push({
            blob: audioBlob,
            duration: duration
          });

          console.log(`✅ Audio generated for scene ${i + 1}`);
          console.log(`📦 Audio size: ${(audioBlob.size / 1024).toFixed(2)}KB`);
          console.log(`⏱️ Audio duration: ${duration.toFixed(2)}s`);

          const audioProgress = ((i + 1) / videoStructure!.scenes.length) * 25;
          setProgress(audioProgress);
        } catch (audioError) {
          console.error(`❌ Error generating audio for scene ${i + 1}:`, audioError);
          throw new Error(`Failed to generate audio for scene ${i + 1}: ${audioError.message}`);
        }
      }

      // 2. Process images (25-50%)
      console.log('🖼️ Processing images...');
      try {
        // Verify we have all images
        console.log('📸 Available images:', sceneImages);
        if (sceneImages.length !== videoStructure!.scenes.length) {
          console.warn('⚠️ Missing images:', videoStructure!.scenes.length - sceneImages.length);
        }
        setProgress(50);
      } catch (imageError) {
        console.error('❌ Error processing images:', imageError);
        throw new Error(`Failed to process images: ${imageError.message}`);
      }

      // 3. Initialize FFmpeg (50-75%)
      console.log('🎥 Initializing FFmpeg...');
      try {
        const ffmpeg = new FFmpeg();
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';

        console.log('📦 Loading FFmpeg core files...');
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        console.log('✅ FFmpeg loaded successfully');

        // Write audio files to FFmpeg
        console.log('💾 Writing audio files to FFmpeg...');
        for (let i = 0; i < audioSegments.length; i++) {
          await ffmpeg.writeFile(`audio${i}.mp3`, new Uint8Array(await audioSegments[i].blob.arrayBuffer()));
          console.log(`✅ Written audio${i}.mp3`);
        }

        // Write images to FFmpeg
        console.log('💾 Writing images to FFmpeg...');
        for (let i = 0; i < sceneImages.length; i++) {
          const imageResponse = await fetch(sceneImages[i]);
          const imageBlob = await imageResponse.blob();
          await ffmpeg.writeFile(`image${i}.jpg`, new Uint8Array(await imageBlob.arrayBuffer()));
          console.log(`✅ Written image${i}.jpg`);
        }

        // Write background music
        console.log('🎵 Writing background music...');
        const musicResponse = await fetch(MUSIC_OPTIONS.find(m => m.id === selectedMusic)?.src || '');
        const musicBlob = await musicResponse.blob();
        await ffmpeg.writeFile('background.mp3', new Uint8Array(await musicBlob.arrayBuffer()));
        console.log('✅ Written background music');

        setProgress(75);

        // 4. Generate final video (75-100%)
        console.log('🎬 Generating final video...');

        // Modificar la sección del comando FFmpeg
        const command = [
          // Input files
          ...audioSegments.map((_, i) => ['-i', `audio${i}.mp3`]).flat(),
          ...sceneImages.map((_, i) => ['-i', `image${i}.jpg`]).flat(),
          '-i', 'background.mp3',

          // Filter complex
          '-filter_complex',
          [
            // Convertir cada imagen en video con la duración exacta de su audio
            ...audioSegments.map((segment, i) =>
              `[${i + audioSegments.length}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,` +
              `loop=loop=-1:size=1,setpts=N/FRAME_RATE/TB,trim=duration=${segment.duration}[v${i}]`
            ),

            // Concatenar los videos
            `${audioSegments.map((_, i) => `[v${i}]`).join('')}concat=n=${audioSegments.length}:v=1:a=0[outv]`,

            // Concatenar los audios
            `${audioSegments.map((_, i) => `[${i}:a]`).join('')}concat=n=${audioSegments.length}:v=0:a=1[voice]`,

            // Procesar la música de fondo y hacerla loop
            `[${audioSegments.length * 2}:a]volume=0.3,aloop=loop=-1:size=2147483647[music]`,

            // Mezclar voz y música
            '[voice][music]amix=inputs=2:duration=first[aout]'
          ].join(';'),

          // Output mapping
          '-map', '[outv]',
          '-map', '[aout]',

          // Codec settings
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-pix_fmt', 'yuv420p',

          // Quality settings
          '-preset', 'ultrafast',
          '-crf', '28',

          // Output file
          'output.mp4'
        ];

        // Añadir logs para debug de duraciones
        console.log('📊 Audio segments durations:', audioSegments.map(s => s.duration));
        console.log('🎬 Total duration:', audioSegments.reduce((sum, s) => sum + s.duration, 0));

        console.log('📝 FFmpeg command:', command.join(' '));

        await ffmpeg.exec(command);
        console.log('✅ Video generated successfully');

        // Verificar y leer el archivo de salida
        try {
          // Listar archivos para verificar
          const files = await ffmpeg.listDir('/');
          console.log('📁 Files in FFmpeg:', files);

          // Verificar si el archivo existe y su tamaño
          const outputFile = files.find(f => f.name === 'output.mp4');
          if (!outputFile) {
            throw new Error('Output file not found');
          }
          console.log('📄 Output file info:', outputFile);

          // Leer el archivo
          const data = await ffmpeg.readFile('output.mp4');
          console.log('📦 Raw data size:', data.length);

          if (data.length === 0) {
            throw new Error('Generated video file is empty');
          }

          // Crear blob con el tipo MIME correcto
          const videoBlob = new Blob([data], {
            type: 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"'
          });
          console.log('🎥 Video blob size:', videoBlob.size);

          // Revocar URL anterior si existe
          if (generatedVideoUrl) {
            URL.revokeObjectURL(generatedVideoUrl);
          }

          // Crear nueva URL
          const videoUrl = URL.createObjectURL(videoBlob);
          console.log('🔗 Video URL created:', videoUrl);

          // Verificar que el blob es válido
          const tempVideo = document.createElement('video');
          await new Promise((resolve, reject) => {
            tempVideo.onloadedmetadata = resolve;
            tempVideo.onerror = reject;
            tempVideo.src = videoUrl;
          });
          console.log('✅ Video blob verified as playable');

          setGeneratedVideoUrl(videoUrl);
          console.log(`📦 Final video size: ${(videoBlob.size / (1024 * 1024)).toFixed(2)}MB`);
          setProgress(100);
          setIsGenerating(false);

        } catch (error) {
          console.error('❌ Error processing output file:', error);
          console.error('Error details:', {
            name: error.name,
            message: error.message,
            stack: error.stack
          });
          throw new Error(`Failed to process output video: ${error.message}`);
        }

      } catch (error) {
        console.error('❌ Fatal error in video generation:', error);
        console.error('Full error details:', {
          name: error.name,
          message: error.message,
          stack: error.stack
        });
        alert(`Error generating video: ${error.message}`);
        setIsGenerating(false);
      }

    } catch (error) {
      console.error('❌ Fatal error in video generation:', error);
      console.error('Full error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      alert(`Error generating video: ${error.message}`);
      setIsGenerating(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
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

      {/* Step 1: Prompt Input */}
      {currentStep === 1 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold mb-4">Enter Your Video Prompt</h2>
          <form onSubmit={handlePromptSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                What's your video about?
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="E.g.: The secret of Area 51..."
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 h-32"
                required
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  Generate Video Structure
                  <ArrowRightIcon className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* Step 2: Preview */}
      {currentStep === 2 && videoStructure && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold mb-4">Preview Generated Scenes</h2>

          {/* Title */}
          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-900">{videoStructure.title}</h3>
            <p className="text-sm text-gray-500">Total Duration: {videoStructure.totalDuration}s</p>
          </div>

          {/* Scenes Preview */}
          <div className="space-y-6">
            {videoStructure.scenes.map((scene, index) => (
              <div
                key={index}
                className="border border-gray-200 rounded-lg p-4 hover:border-blue-500 transition-colors"
              >
                <div className="flex gap-4">
                  {/* Image Preview */}
                  <div className="w-1/3">
                    {sceneImages[index] ? (
                      <img
                        src={sceneImages[index]}
                        alt={`Scene ${index + 1}`}
                        className="w-full h-48 object-cover rounded-lg"
                      />
                    ) : (
                      <div className="w-full h-48 bg-gray-100 rounded-lg flex items-center justify-center">
                        <p className="text-gray-400">No image available</p>
                      </div>
                    )}
                  </div>

                  {/* Scene Details */}
                  <div className="w-2/3 space-y-3">
                    <div>
                      <h4 className="font-medium text-gray-900">Scene {index + 1}</h4>
                      <p className="text-sm text-gray-500">Duration: {scene.duration}s</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">Description</label>
                      <p className="text-sm text-gray-600">{scene.text}</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">Voice Text</label>
                      <p className="text-sm text-gray-600">{scene.voicePrompt}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Navigation Buttons */}
          <div className="mt-6 flex justify-between">
            <button
              onClick={() => setCurrentStep(1)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={() => setCurrentStep(3)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              Continue to Customize
            </button>
          </div>

          {/* Error Message */}
          {sceneImages.length === 0 && (
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                ⚠️ No images were loaded. The video will be generated with placeholder images.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Customize */}
      {currentStep === 3 && videoStructure && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold mb-4">Customize Your Video</h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Preview Side */}
            <div>
              <h3 className="font-medium mb-4">Preview</h3>
              <div className="aspect-[9/16] bg-black rounded-lg overflow-hidden relative">
                {/* Scene Preview */}
                {sceneImages[currentSceneIndex] ? (
                  <img
                    src={sceneImages[currentSceneIndex]}
                    alt={`Scene ${currentSceneIndex + 1}`}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
                    <p className="text-gray-400">No preview available</p>
                  </div>
                )}

                {/* Scene Text Overlay */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 p-4">
                  <p className="text-white text-sm">
                    {videoStructure.scenes[currentSceneIndex].voicePrompt}
                  </p>
                </div>

                {/* Navigation Arrows */}
                <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-between px-4">
                  <button
                    onClick={() => setCurrentSceneIndex(prev => Math.max(0, prev - 1))}
                    disabled={currentSceneIndex === 0}
                    className="w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/75 disabled:opacity-30"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setCurrentSceneIndex(prev => Math.min(videoStructure.scenes.length - 1, prev + 1))}
                    disabled={currentSceneIndex === videoStructure.scenes.length - 1}
                    className="w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/75 disabled:opacity-30"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>

                {/* Scene Counter */}
                <div className="absolute top-4 right-4 bg-black/50 px-3 py-1 rounded-full">
                  <p className="text-white text-sm">
                    {currentSceneIndex + 1} / {videoStructure.scenes.length}
                  </p>
                </div>
              </div>

              {/* Scene Timeline */}
              <div className="mt-4 flex gap-2">
                {videoStructure.scenes.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentSceneIndex(index)}
                    className={`flex-1 h-2 rounded-full transition-all ${
                      currentSceneIndex === index ? 'bg-blue-600' : 'bg-gray-200 hover:bg-gray-300'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Customization Side */}
            <div className="space-y-6">
              {/* Voice Selection */}
              <div>
                <h3 className="font-medium mb-3">Voice</h3>
                <div className="grid grid-cols-2 gap-2">
                  {VOICE_OPTIONS.map((voice) => (
                    <div
                      key={voice.id}
                      onClick={() => setSelectedVoice(voice.id)}
                      className={`p-3 rounded-lg border flex items-center gap-2 transition-all cursor-pointer ${
                        selectedVoice === voice.id
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex-1">
                        <p className="font-medium">{voice.name}</p>
                      </div>
                      {/* Play Sample Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const audio = new Audio(voice.demo);
                          audio.play();
                        }}
                        className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Background Music */}
              <div>
                <h3 className="font-medium mb-3">Background Music</h3>
                <div className="space-y-2">
                  {MUSIC_OPTIONS.map((music) => (
                    <div
                      key={music.id}
                      onClick={() => setSelectedMusic(music.id)}
                      className={`w-full p-3 rounded-lg border flex items-center gap-2 transition-all cursor-pointer ${
                        selectedMusic === music.id
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex-1">
                        <p className="font-medium">{music.name}</p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const audio = new Audio(music.src);
                          audio.volume = 0.5;
                          audio.play();
                        }}
                        className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Video Stats */}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <h3 className="font-medium mb-3">Video Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Duration</p>
                    <p className="font-medium">{videoStructure.totalDuration}s</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Scenes</p>
                    <p className="font-medium">{videoStructure.scenes.length}</p>
                  </div>
                </div>
              </div>

              {/* Navigation Buttons */}
              <div className="flex gap-3 pt-6">
                <button
                  onClick={() => setCurrentStep(2)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  onClick={() => {
                    handleGenerateVideo();
                    setCurrentStep(4);
                  }}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center justify-center gap-2"
                >
                  Generate Video
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Generate */}
      {currentStep === 4 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          {isGenerating ? (
            // Pantalla de generación
            <div className="space-y-8">
              <div className="text-center">
                <h2 className="text-xl font-semibold mb-2">Generating Your Video</h2>
                <p className="text-gray-600">This may take a few minutes. Please don't close this window.</p>
              </div>

              {/* Progress Circle */}
              <div className="flex flex-col items-center">
                <div className="relative w-32 h-32">
                  <svg className="w-full h-full" viewBox="0 0 100 100">
                    <circle
                      className="text-gray-200"
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
                      }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl font-bold">{Math.round(progress)}%</span>
                  </div>
                </div>
              </div>

              {/* Progress Steps */}
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${progress < 25 ? 'bg-blue-500 animate-pulse' : 'bg-green-500'}`} />
                      <span className={`text-sm font-medium ${progress < 25 ? 'text-blue-600' : 'text-green-600'}`}>
                        Generating Audio
                      </span>
                    </div>
                    <span className="text-sm text-gray-500">{Math.min(100, progress * 4)}%</span>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${
                        progress < 25 ? 'bg-gray-300' : progress < 50 ? 'bg-blue-500 animate-pulse' : 'bg-green-500'
                      }`} />
                      <span className={`text-sm font-medium ${
                        progress < 25 ? 'text-gray-500' : progress < 50 ? 'text-blue-600' : 'text-green-600'
                      }`}>
                        Processing Images
                      </span>
                    </div>
                    <span className="text-sm text-gray-500">
                      {progress < 25 ? '0' : Math.min(100, (progress - 25) * 4)}%
                    </span>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${
                        progress < 50 ? 'bg-gray-300' : progress < 75 ? 'bg-blue-500 animate-pulse' : 'bg-green-500'
                      }`} />
                      <span className={`text-sm font-medium ${
                        progress < 50 ? 'text-gray-500' : progress < 75 ? 'text-blue-600' : 'text-green-600'
                      }`}>
                        Composing Video
                      </span>
                    </div>
                    <span className="text-sm text-gray-500">
                      {progress < 50 ? '0' : Math.min(100, (progress - 50) * 4)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : generatedVideoUrl ? (
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Video Generated Successfully!</h2>
              <p className="text-gray-600 mt-2">Your video is ready to download and share</p>
            </div>
          ) : null}

          {/* Video Preview */}
          {generatedVideoUrl && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-4">
                <h3 className="font-medium text-gray-900">Preview</h3>
                <div className="aspect-[9/16] bg-black rounded-lg overflow-hidden">
                  <video
                    src={generatedVideoUrl}
                    controls
                    className="w-full h-full"
                    playsInline
                  />
                </div>
              </div>

              {/* Download Options */}
              <div className="space-y-6">
                <div>
                  <h3 className="font-medium text-gray-900 mb-4">Download Options</h3>
                  <div className="space-y-3">
                    <button
                      onClick={() => {
                        const a = document.createElement('a');
                        a.href = generatedVideoUrl;
                        a.download = `video-${Date.now()}.mp4`;
                        a.click();
                      }}
                      className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 flex items-center justify-center gap-2"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 102 0v7.586l1.293-1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clipRule="evenodd" />
                      </svg>
                      Download Video
                    </button>

                    <button
                      onClick={() => setCurrentStep(3)}
                      className="w-full border border-gray-300 text-gray-700 px-6 py-3 rounded-lg font-medium hover:bg-gray-50 flex items-center justify-center gap-2"
                    >
                      Generate Another Version
                    </button>
                  </div>
                </div>

                {/* Video Details */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-3">Video Details</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Duration</p>
                      <p className="font-medium">{videoStructure.totalDuration}s</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Format</p>
                      <p className="font-medium">MP4 / H.264</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Resolution</p>
                      <p className="font-medium">1080 x 1920</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Scenes</p>
                      <p className="font-medium">{videoStructure.scenes.length}</p>
                    </div>
                  </div>
                </div>

                {/* Share Options */}
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Share</h4>
                  <div className="grid grid-cols-3 gap-3">
                    <button className="flex items-center justify-center gap-2 p-3 bg-[#1DA1F2] text-white rounded-lg hover:bg-[#1a8cd8]">
                      Twitter
                    </button>
                    <button className="flex items-center justify-center gap-2 p-3 bg-[#25D366] text-white rounded-lg hover:bg-[#20bd5a]">
                      WhatsApp
                    </button>
                    <button className="flex items-center justify-center gap-2 p-3 bg-[#FF0000] text-white rounded-lg hover:bg-[#e50000]">
                      YouTube
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
