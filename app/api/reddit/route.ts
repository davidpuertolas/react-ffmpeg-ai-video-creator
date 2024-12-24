import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Extraer el ID del post de la URL de Reddit
    const urlPattern = /reddit\.com\/r\/[^/]+\/comments\/([a-zA-Z0-9]+)/;
    const match = url.match(urlPattern);

    if (!match) {
      return NextResponse.json({ error: 'Invalid Reddit URL format' }, { status: 400 });
    }

    const postId = match[1];

    // Hacer la petición a la API de Reddit
    const redditResponse = await fetch(`https://www.reddit.com/comments/${postId}.json`);

    if (!redditResponse.ok) {
      return NextResponse.json(
        { error: `Reddit API error: ${redditResponse.status} ${redditResponse.statusText}` },
        { status: redditResponse.status }
      );
    }

    const data = await redditResponse.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Reddit API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
}

// Manejar las solicitudes OPTIONS para CORS
export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
