'use client';

import { useRef, useState } from 'react';

export default function VideoEditor() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoSrc(URL.createObjectURL(file));
    }
  };

  const handleDownload = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    video.play();
    video.addEventListener('play', () => {
      const draw = () => {
        if (!video.paused && !video.ended) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          ctx.font = '30px Arial';
          ctx.fillStyle = 'white';
          ctx.fillText('Texto sobre el video', 50, 50);
          requestAnimationFrame(draw);
        }
      };
      draw();
    });

    // Descargar como imagen (primer cuadro como ejemplo)
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'video_with_text.png';
      a.click();
    });
  };

  const handleDownloadCombined = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    // Pausar el video
    videoRef.current.pause();

    // Crear un nuevo canvas para la grabación
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;

    // Configurar el MediaRecorder
    const stream = canvas.captureStream(30); // 30 FPS
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp9'
    });

    const chunks: Blob[] = [];
    mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'reddit-video-with-comments.webm';
      a.click();
      URL.revokeObjectURL(url);
    };

    // Iniciar la grabación
    mediaRecorder.start();

    // Reproducir el video y grabar cada frame
    videoRef.current.currentTime = 0;
    videoRef.current.play();

    const drawFrame = () => {
      if (!videoRef.current || !ctx || !canvasRef.current) return;

      // Dibujar el frame actual del video
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

      // Dibujar el contenido del canvas de los comentarios
      ctx.drawImage(canvasRef.current, 0, 0, canvas.width, canvas.height);

      if (!videoRef.current.ended) {
        requestAnimationFrame(drawFrame);
      } else {
        mediaRecorder.stop();
        videoRef.current.pause();
      }
    };

    drawFrame();
  };

  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold mb-4">Video Editor</h2>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Upload Video
            </label>
            <input
              type="file"
              accept="video/*"
              onChange={handleVideoUpload}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-full file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100"
            />
          </div>

          {videoSrc && (
            <div className="space-y-4">
              <div className="aspect-video bg-black rounded-lg overflow-hidden">
                <video
                  ref={videoRef}
                  src={videoSrc}
                  controls
                  className="w-full h-full"
                />
              </div>
              <canvas
                ref={canvasRef}
                className="hidden"
              />
              <button
                onClick={handleDownload}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
              >
                Download Frame
              </button>
              <button
                onClick={handleDownloadCombined}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 ml-4"
              >
                Descargar Video con Comentarios
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
