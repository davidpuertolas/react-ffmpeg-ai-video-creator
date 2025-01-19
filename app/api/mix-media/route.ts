import { NextResponse } from 'next/server';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const video = formData.get('video') as Blob;
    const audioFiles: Blob[] = [];

    // Recolectar todos los archivos de audio
    for (let i = 0; formData.has(`audio_${i}`); i++) {
      const audio = formData.get(`audio_${i}`) as Blob;
      audioFiles.push(audio);
    }

    // Crear directorio temporal
    const tempDir = await createTempDir();

    // Guardar archivos temporalmente
    const videoPath = join(tempDir, 'input.webm');
    await writeFile(videoPath, Buffer.from(await video.arrayBuffer()));

    const audioPaths = await Promise.all(
      audioFiles.map(async (audio, i) => {
        const path = join(tempDir, `audio_${i}.mp3`);
        await writeFile(path, Buffer.from(await audio.arrayBuffer()));
        return path;
      })
    );

    // Inicializar FFmpeg
    const ffmpeg = new FFmpeg();
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    // Crear archivo de concatenación de audio
    const concatFile = join(tempDir, 'concat.txt');
    await writeFile(
      concatFile,
      audioPaths.map(path => `file '${path}'`).join('\n')
    );

    // Concatenar audios
    await ffmpeg.exec([
      '-f', 'concat',
      '-safe', '0',
      '-i', concatFile,
      '-c', 'copy',
      join(tempDir, 'combined_audio.mp3')
    ]);

    // Mezclar video con audio
    await ffmpeg.exec([
      '-i', videoPath,
      '-i', join(tempDir, 'combined_audio.mp3'),
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-strict', 'experimental',
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-shortest',
      join(tempDir, 'output.mp4')
    ]);

    // Leer el archivo final
    const outputPath = join(tempDir, 'output.mp4');
    const outputBuffer = await ffmpeg.readFile(outputPath);

    // Devolver el video mezclado
    return new NextResponse(outputBuffer, {
      headers: {
        'Content-Type': 'video/mp4',
      },
    });

  } catch (error) {
    console.error('Error mixing media:', error);
    return NextResponse.json({ error: 'Failed to mix media' }, { status: 500 });
  }
}

async function createTempDir() {
  const dir = join(tmpdir(), `reddit-video-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  return dir;
}
