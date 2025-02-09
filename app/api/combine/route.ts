import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const videoFile = formData.get('video') as File;
    const audioFile = formData.get('audio') as File;

    if (!videoFile || !audioFile) {
      return NextResponse.json(
        { error: 'Faltan archivos' },
        { status: 400 }
      );
    }

    // Por ahora solo confirmamos que recibimos los archivos
    return NextResponse.json({ message: 'Archivos recibidos correctamente' });

  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Error al procesar los archivos' },
      { status: 500 }
    );
  }
}
