'use client';

import { useState } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

export default function VideoProcessor() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState(0);

  const parseSRT = (content: string) => {
    const subtitles = [];
    const blocks = content.trim().split(/\n\s*\n/);

    for (const block of blocks) {
      const lines = block.split('\n');
      if (lines.length >= 3) {
        const times = lines[1].split(' --> ');
        const startTime = timeToSeconds(times[0]);
        const endTime = timeToSeconds(times[1]);
        const text = lines.slice(2).join('\n');
        subtitles.push({ startTime, endTime, text });
      }
    }
    return subtitles;
  };

  const timeToSeconds = (timeStr: string) => {
    const [hours, minutes, seconds] = timeStr.split(':');
    const [secs, ms] = seconds.split(',');
    return parseFloat(hours) * 3600 +
           parseFloat(minutes) * 60 +
           parseFloat(secs) +
           parseFloat(ms) / 1000;
  };

  const processFiles = async (videoFile, audioFile, subtitleFile) => {
    let ffmpeg = null;
    try {
      setLoading(true);
      setMessage('Initializing FFmpeg...');
      setProgress(0);

      // Initialize FFmpeg
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.4/dist/umd';
      ffmpeg = new FFmpeg();

      let currentStep = 1;
      const totalSteps = subtitleFile ? 4 : 3;

      // Set up logging
      ffmpeg.on('log', ({ message }) => {
        console.log('FFmpeg Log:', message);
      });

      ffmpeg.on('progress', ({ progress }) => {
        // Adjust progress based on current step
        const stepProgress = (currentStep - 1) * (100 / totalSteps) +
                           (progress * (100 / totalSteps));
        setProgress(Math.round(stepProgress));
        setMessage(`Step ${currentStep}/${totalSteps}: ${getCurrentStepMessage(currentStep)} - ${Math.round(progress * 100)}%`);
      });

      const getCurrentStepMessage = (step) => {
        switch(step) {
          case 1:
            return 'Loading FFmpeg';
          case 2:
            return 'Loading input files';
          case 3:
            return subtitleFile ? 'Combining video and audio' : 'Processing final video';
          case 4:
            return 'Adding subtitles';
          default:
            return 'Processing';
        }
      };

      // Load FFmpeg
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });

      currentStep = 2;
      setMessage(`Step ${currentStep}/${totalSteps}: Loading input files...`);

      // Write input files
      await ffmpeg.writeFile('input.mp4', await fetchFile(videoFile));
      await ffmpeg.writeFile('input.mp3', await fetchFile(audioFile));

      currentStep = 3;
      setMessage(`Step ${currentStep}/${totalSteps}: Processing...`);

      if (subtitleFile) {
        setMessage(`Step ${currentStep}/${totalSteps}: Adding video with subtitles...`);

        // Cargar la fuente desde la carpeta public
        const fontResponse = await fetch('/fonts/Inter-Bold.ttf');
        const fontData = await fontResponse.arrayBuffer();
        await ffmpeg.writeFile('Inter-Bold.ttf', new Uint8Array(fontData));

        // Leer el contenido del archivo SRT
        const srtContent = await subtitleFile.text();
        const subtitles = parseSRT(srtContent);

        // Generar el comando drawtext para cada subtítulo
        const drawTextCommands = subtitles.map(sub =>
          `drawtext=fontfile=Inter-Bold.ttf:` +
          `text='${sub.text.replace(/'/g, "'\\\\\'")}':` + // Escapar comillas simples
          `fontsize=36:fontcolor=white:box=1:boxcolor=black@0.5:boxborderw=5:` +
          `x=(w-text_w)/2:y=h-th-20:` +
          `enable='between(t,${sub.startTime},${sub.endTime})'`
        ).join(',');

        await ffmpeg.exec([
          '-i', 'input.mp4',      // Entrada del archivo de video
          '-i', 'input.mp3',      // Entrada del archivo de audio
          '-c:v', 'libx264',      // Codec de video H.264
          '-c:a', 'aac',          // Codec de audio AAC
          '-map', '0:v:0',        // Mapea la primera pista de video del primer input
          '-map', '1:a:0',        // Mapea la primera pista de audio del segundo input
          '-vf', drawTextCommands,
          '-shortest',            // Termina cuando el stream más corto acabe
          '-preset', 'ultrafast', // Configuración de velocidad de codificación
          '-y',                   // Sobrescribe el archivo de salida sin preguntar
          'output.mp4'            // Archivo de salida
        ]);

        currentStep = 4;
        setMessage(`Step ${currentStep}/${totalSteps}: Finalizing with subtitles...`);
      } else {
        // Combine only video and audio
        setMessage(`Step ${currentStep}/${totalSteps}: Combining video and audio...`);
        await ffmpeg.exec([
          '-i', 'input.mp4',
          '-i', 'input.mp3',
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-map', '0:v:0',
          '-map', '1:a:0',
          '-shortest',
          'output.mp4'
        ]);
      }

      // Read and download the output file
      setMessage('Preparing download...');
      const data = await ffmpeg.readFile('output.mp4');
      const blob = new Blob([data], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = 'processed_video.mp4';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setMessage('Processing completed successfully!');
    } catch (error) {
      console.error('Processing error:', error);
      setMessage(`Error: ${error.message || 'Failed to process files'}`);
    } finally {
      if (ffmpeg) {
        try {
          await ffmpeg.terminate();
        } catch (error) {
          console.error('Error terminating FFmpeg:', error);
        }
      }
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          const video = formData.get('video');
          const audio = formData.get('audio');
          const subtitles = formData.get('subtitles');

          if (!video || !audio) {
            setMessage('Please select both video and audio files');
            return;
          }

          await processFiles(video, audio, subtitles || null);
        }}
        className="space-y-4"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Video File (MP4)
            </label>
            <input
              type="file"
              name="video"
              accept="video/mp4"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Audio File (MP3)
            </label>
            <input
              type="file"
              name="audio"
              accept="audio/mp3"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Subtitles (Optional, SRT)
            </label>
            <input
              type="file"
              name="subtitles"
              accept=".srt"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-sm text-gray-500">
              Make sure the SRT file is UTF-8 encoded
            </p>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {loading ? 'Processing...' : 'Process Video'}
        </button>
      </form>

      {(message || progress > 0) && (
        <div className="mt-4 p-4 border rounded-md bg-gray-50">
          <p className="text-sm text-gray-700">{message}</p>
          {progress > 0 && (
            <div className="mt-2 w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
