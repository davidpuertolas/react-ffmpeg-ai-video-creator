import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

export async function GET() {
  try {
    const videoPath = path.join(process.cwd(), 'public', 'minecraft-vertical.mp4');
    console.log('Video path:', videoPath);

    if (!fs.existsSync(videoPath)) {
      console.error('Video not found at path:', videoPath);
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    const videoBuffer = fs.readFileSync(videoPath);
    console.log('Video buffer length:', videoBuffer.length);

    return new NextResponse(videoBuffer, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': 'attachment; filename="minecraft-vertical.mp4"',
      },
    });
  } catch (error) {
    console.error('Error serving video:', error);
    return NextResponse.json({ error: 'Error serving video' }, { status: 500 });
  }
}
