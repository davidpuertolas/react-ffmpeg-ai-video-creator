'use client';
import { useState, useRef } from 'react';

export default function DemoPage() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [text, setText] = useState('DEMO');
  const [textPosition, setTextPosition] = useState({ x: 50, y: 50 }); // Porcentajes
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }

    try {
      const url = URL.createObjectURL(file);
      const video = videoRef.current;
      if (video) {
        video.src = url;
        video.load();
      }
      setVideoUrl(url);
    } catch (error) {
      console.error('Error al cargar el video:', error);
      alert('Error al cargar el video. Intenta con otro archivo.');
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleExport = async () => {
    console.log('1. Iniciando exportación...');
    if (!videoRef.current || isExporting) {
      console.log('Error: No hay video o ya está exportando');
      return;
    }
    setIsExporting(true);
    setExportProgress(0);

    try {
    const video = videoRef.current;
      const totalFrames = Math.floor(video.duration * 60); // 60fps
      let processedFrames = 0;

      console.log('2. Video referencia obtenida:', {
        duration: video.duration,
        currentTime: video.currentTime,
        readyState: video.readyState
      });

      const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.log('Error: No se pudo obtener el contexto 2D');
        return;
      }

      canvas.width = video.videoHeight * 9/16;
      canvas.height = video.videoHeight;
      console.log('3. Canvas creado con dimensiones:', {
        width: canvas.width,
        height: canvas.height
      });

      // Get supported MIME type
      const mimeTypes = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
        'video/mp4'
      ];
      const mimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));
      console.log('4. MIME types soportados:', {
        tested: mimeTypes,
        selected: mimeType
      });

      if (!mimeType) {
        throw new Error('No supported video format found');
      }

      console.log('5. Iniciando captura del stream');
      const stream = canvas.captureStream(60);
      console.log('6. Stream creado:', {
        tracks: stream.getTracks().length,
        active: stream.active
      });

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 5000000
      });
      console.log('7. MediaRecorder creado:', {
        state: mediaRecorder.state,
        mimeType: mediaRecorder.mimeType
      });

      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => {
        console.log('8. Nuevo chunk disponible:', {
          size: e.data?.size,
          type: e.data?.type
        });
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        console.log('9. MediaRecorder detenido. Chunks recolectados:', chunks.length);
        try {
          const blob = new Blob(chunks, { type: mimeType });
          console.log('10. Blob creado:', {
            size: blob.size,
            type: blob.type
          });

          const url = URL.createObjectURL(blob);
          console.log('11. URL creada:', url);

          const a = document.createElement('a');
          a.href = url;
          a.download = `video-con-texto.${mimeType.includes('mp4') ? 'mp4' : 'webm'}`;
          document.body.appendChild(a);
          console.log('12. Elemento de descarga creado');

          a.click();
          console.log('13. Click de descarga iniciado');

          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          setIsExporting(false);
        } catch (error) {
          console.error('Error en onstop:', error);
          alert('Error al crear el video');
          setIsExporting(false);
        }
      };

      const drawFrame = () => {
        try {
          ctx.fillStyle = 'black';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          const scale = canvas.height / video.videoHeight;
          const scaledWidth = video.videoWidth * scale;
          const xOffset = (scaledWidth - canvas.width) / 2;

          ctx.drawImage(
            video,
            xOffset / scale,
            0,
            canvas.width / scale,
            video.videoHeight,
            0,
            0,
            canvas.width,
            canvas.height
          );

          const fontSize = canvas.height * 0.1;
          ctx.font = `bold ${fontSize}px Arial`;
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

          const textX = canvas.width * (textPosition.x / 100);
          const textY = canvas.height * (textPosition.y / 100);

          ctx.shadowColor = 'black';
          ctx.shadowBlur = 4;
          ctx.lineWidth = 4;
          ctx.strokeStyle = 'black';
          ctx.strokeText(text, textX, textY);
          ctx.shadowBlur = 0;
          ctx.fillText(text, textX, textY);

          if (!video.ended && mediaRecorder.state === 'recording') {
            processedFrames++;
            setExportProgress((processedFrames / totalFrames) * 100);
            requestAnimationFrame(drawFrame);
          } else if (mediaRecorder.state === 'recording') {
            console.log('14. Video terminado, deteniendo grabación');
            mediaRecorder.stop();
          }
        } catch (error) {
          console.error('Error en drawFrame:', error);
        }
      };

      console.log('15. Iniciando grabación');
      mediaRecorder.start(1000);
      video.currentTime = 0;
      video.muted = true;

      const playbackPromise = new Promise<void>((resolve, reject) => {
        video.onended = () => {
          console.log('16. Video terminado');
          if (mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
          }
          resolve();
        };
        video.onerror = reject;
      });

      console.log('17. Iniciando reproducción');
      video.play().then(() => {
        console.log('18. Video reproduciendo, iniciando drawFrame');
        drawFrame();
      }).catch((error) => {
        console.error('19. Error reproduciendo:', error);
        mediaRecorder.stop();
        setIsExporting(false);
      });

      await playbackPromise;
      console.log('20. Proceso completado');

    } catch (error) {
      console.error('Error general:', error);
      alert('Error al exportar el video. Por favor, intenta de nuevo.');
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  return (
    <div className="min-h-screen bg-[#1A1A1A] text-white">
      {/* Header mejorado */}
      <header className="bg-black border-b border-gray-800 p-4 flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <h1 className="text-xl font-bold bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
            Video Editor Pro
          </h1>
          <div className="relative">
          <input
            type="file"
              id="video-input"
            accept="video/*"
            onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <label
              htmlFor="video-input"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer transition-colors inline-block"
            >
              Abrir Video
            </label>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <button
            onClick={handleExport}
            disabled={!videoUrl || isExporting}
            className={`px-6 py-2 rounded-lg font-medium transition-all ${
              !videoUrl
                ? 'bg-gray-700 cursor-not-allowed opacity-50'
                : isExporting
                  ? 'bg-purple-600'
                  : 'bg-gradient-to-r from-blue-500 to-purple-500 hover:shadow-lg hover:shadow-blue-500/20'
            }`}
          >
            {isExporting ? 'Exportando...' : 'Exportar'}
          </button>
          {isExporting && (
            <div className="w-48">
              <div className="text-xs text-gray-400 mb-1 text-right">
                {Math.round(exportProgress)}%
              </div>
              <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
                  style={{ width: `${exportProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Editor con diseño mejorado */}
      <div className="flex h-[calc(100vh-8rem)]">
        {/* Preview Panel */}
        <div className="w-3/4 bg-black p-6 relative">
          {videoUrl ? (
            <div className="relative aspect-[9/16] mx-auto h-full bg-[#0A0A0A] rounded-lg shadow-2xl overflow-hidden">
              <video
                ref={videoRef}
                src={videoUrl}
                className="absolute inset-0 w-full h-full object-contain"
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onError={(e) => {
                  console.error('Error en el video:', e);
                  alert('Error al reproducir el video. Intenta con otro archivo.');
                }}
                controls
                playsInline
              />
              <div
                className="absolute inset-0 pointer-events-none flex items-center justify-center"
                style={{
                  left: `${textPosition.x}%`,
                  top: `${textPosition.y}%`,
                  transform: 'translate(-50%, -50%)'
                }}
              >
                <span className="text-white text-4xl font-bold drop-shadow-lg">
                  {text}
                </span>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-4">
              <p className="text-xl">Selecciona un video para comenzar</p>
              <label
                htmlFor="video-input"
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer transition-colors text-white"
              >
                Seleccionar Video
              </label>
            </div>
          )}
        </div>

        {/* Controls Panel mejorado */}
        <div className="w-1/4 bg-[#1E1E1E] p-6 space-y-6 border-l border-gray-800">
          <div className="space-y-3">
            <h3 className="font-bold text-gray-300">Texto</h3>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full p-3 rounded-lg bg-[#2A2A2A] border border-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
            />
          </div>

          <div className="space-y-3">
            <h3 className="font-bold text-gray-300">Posición X: {textPosition.x}%</h3>
            <input
              type="range"
              min="0"
              max="100"
              value={textPosition.x}
              onChange={(e) => setTextPosition(prev => ({ ...prev, x: Number(e.target.value) }))}
              className="w-full accent-blue-500"
            />
          </div>

          <div className="space-y-3">
            <h3 className="font-bold text-gray-300">Posición Y: {textPosition.y}%</h3>
            <input
              type="range"
              min="0"
              max="100"
              value={textPosition.y}
              onChange={(e) => setTextPosition(prev => ({ ...prev, y: Number(e.target.value) }))}
              className="w-full accent-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Timeline mejorado */}
      <div className="h-32 bg-[#1E1E1E] p-6 border-t border-gray-800">
        <div className="space-y-4">
          <div className="flex justify-between text-sm text-gray-400">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
          <input
            type="range"
            min="0"
            max={duration}
            value={currentTime}
            onChange={handleSeek}
            className="w-full accent-blue-500"
            step="0.1"
          />
          <div className="flex space-x-2">
            <div className="bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg px-4 py-2 text-sm font-medium">
              {text}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
