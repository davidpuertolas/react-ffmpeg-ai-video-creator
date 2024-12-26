import { NextResponse } from 'next/server';

async function fetchWithRetry(url: string, options: RequestInit, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Attempt ${i + 1}: Fetching ${url}`);
      const response = await fetch(url, options);

      if (response.ok) {
        console.log(`✅ Success on attempt ${i + 1}`);
        return response;
      }

      // Si es un 403, esperar un poco más en cada intento
      if (response.status === 403) {
        console.log(`🔄 Got 403 on attempt ${i + 1}, waiting before retry...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        continue;
      }

      console.log(`❌ Failed attempt ${i + 1} with status: ${response.status}`);
      throw new Error(`HTTP error! status: ${response.status}`);
    } catch (error) {
      if (i === retries - 1) throw error;
      console.log(`⚠️ Attempt ${i + 1} failed, retrying...`);
    }
  }
  throw new Error('Max retries reached');
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) {
      return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
    }

    // Mejorar la transformación de la URL
    let jsonUrl = url;

    // Asegurarse de que la URL termina en .json
    if (!jsonUrl.endsWith('.json')) {
      // Remover trailing slash si existe
      jsonUrl = jsonUrl.replace(/\/$/, '');
      jsonUrl = `${jsonUrl}.json`;
    }

    // Asegurarse de que usamos HTTPS
    if (!jsonUrl.startsWith('https://')) {
      jsonUrl = jsonUrl.replace(/^http:\/\//, 'https://');
    }

    // Asegurarse de que usamos www si no está presente
    if (!jsonUrl.includes('www.')) {
      jsonUrl = jsonUrl.replace('reddit.com', 'www.reddit.com');
    }

    console.log('🔗 Original URL:', url);
    console.log('🔗 JSON URL:', jsonUrl);

    const response = await fetchWithRetry(jsonUrl, {
      headers: {
        'User-Agent': 'RedditVideoGenerator/1.0 (by /u/YourRedditUsername)',
        'Accept': 'application/json',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
    });

    if (!response.ok) {
      throw new Error(`Reddit API responded with status: ${response.status}`);
    }

    const data = await response.json();

    // Validar la respuesta
    if (!data || !Array.isArray(data) || data.length < 2) {
      console.error('❌ Invalid response structure:', data);
      throw new Error('Invalid response format from Reddit API');
    }

    console.log('✅ Successfully fetched and validated Reddit data');
    return NextResponse.json(data);

  } catch (error) {
    console.error('❌ Error fetching from Reddit:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch from Reddit' },
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
