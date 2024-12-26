import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const videoBlob = formData.get('video') as Blob;

    if (!videoBlob) {
      throw new Error('No video data received');
    }

    const buffer = Buffer.from(await videoBlob.arrayBuffer());
    const outputDir = path.join(process.cwd(), 'public', 'rendered');

    // Crear directorio si no existe
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const fileName = `video-${Date.now()}.webm`;
    const outputPath = path.join(outputDir, fileName);

    fs.writeFileSync(outputPath, buffer);

    return NextResponse.json({
      success: true,
      videoUrl: `/rendered/${fileName}`
    });

  } catch (error) {
    console.error('Error saving video:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save video' },
      { status: 500 }
    );
  }
}
