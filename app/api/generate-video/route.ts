import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

// Configurar FFmpeg con el binario instalado
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Configurar OpenAI
const openai = new OpenAI({
  apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY
});

export async function POST(request: Request) {
  console.log('🚀 Starting video generation process...');
  const startTime = Date.now();

  try {
    console.log('📥 Receiving request data...');
    const {
      selectedComments,
      storyData,
      selectedVideo,
      selectedVoice,
      selectedMusic
    } = await request.json();

    // Crear directorio temporal
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const sessionId = uuidv4();
    const outputPath = path.join(tempDir, `${sessionId}.mp4`);

    // Generar audio para el título
    console.log('🎙️ Generating title audio...');
    const titleAudio = await openai.audio.speech.create({
      model: "tts-1",
      voice: selectedVoice,
      input: storyData.title,
    });

    // Guardar audio del título
    const titlePath = path.join(tempDir, `${sessionId}-title.mp3`);
    fs.writeFileSync(titlePath, Buffer.from(await titleAudio.arrayBuffer()));

    // Generar y guardar audios de comentarios
    const audioFiles = [titlePath];
    for (const commentIndex of selectedComments) {
      console.log(`📝 Processing comment ${commentIndex + 1}/${selectedComments.length}`);
      const comment = storyData.commentsList[commentIndex];
      const commentAudio = await openai.audio.speech.create({
        model: "tts-1",
        voice: selectedVoice,
        input: comment.content,
      });

      const commentPath = path.join(tempDir, `${sessionId}-comment-${commentIndex}.mp3`);
      fs.writeFileSync(commentPath, Buffer.from(await commentAudio.arrayBuffer()));
      audioFiles.push(commentPath);
    }

    // Crear archivo de concatenación
    const concatPath = path.join(tempDir, `${sessionId}-concat.txt`);
    const concatContent = audioFiles.map(file => `file '${file}'`).join('\n');
    fs.writeFileSync(concatPath, concatContent);

    // Concatenar audios
    const combinedAudioPath = path.join(tempDir, `${sessionId}-combined.mp3`);
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(concatPath)
        .inputOptions(['-f concat', '-safe 0'])
        .output(combinedAudioPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    // Combinar video, audio y música
    console.log('🎯 Combining video, audio and music...');
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(path.join(process.cwd(), 'public', selectedVideo))
        .input(combinedAudioPath)
        .input(path.join(process.cwd(), 'public', selectedMusic))
        .complexFilter([
          '[1:a]volume=1[speech]',
          '[2:a]volume=0.3[music]',
          '[speech][music]amix=inputs=2[aout]'
        ])
        .outputOptions([
          '-map 0:v',
          '-map [aout]',
          '-shortest'
        ])
        .output(outputPath)
        .on('progress', (progress) => {
          console.log(`Processing: ${progress.percent}% done`);
        })
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    // Leer el archivo final
    console.log('📤 Reading final video...');
    const videoData = fs.readFileSync(outputPath);
    const videoBase64 = videoData.toString('base64');

    // Limpiar archivos temporales
    console.log('🧹 Cleaning up...');
    fs.unlinkSync(outputPath);
    fs.unlinkSync(concatPath);
    fs.unlinkSync(combinedAudioPath);
    audioFiles.forEach(file => fs.unlinkSync(file));

    const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✨ Video generated successfully in ${processingTime} seconds`);

    return NextResponse.json({
      success: true,
      video: videoBase64,
      stats: {
        processingTime,
        videoSize: (videoData.length / 1024 / 1024).toFixed(2) + 'MB'
      }
    });

  } catch (error) {
    console.error('❌ Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
