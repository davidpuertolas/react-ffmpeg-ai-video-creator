import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const videoFile = formData.get("video") as File;
    const caption = formData.get("caption") as string;

    if (!videoFile) {
      return NextResponse.json(
        { success: false, message: "No se proporcionó ningún archivo de video" },
        { status: 400 }
      );
    }

    // En una implementación real, aquí:
    // 1. Verificarías que el usuario esté autenticado con TikTok
    // 2. Usarías el token de acceso para subir el video a través de la API de TikTok
    // 3. Manejarías la respuesta de la API

    console.log(`Subiendo video "${videoFile.name}" con descripción: "${caption}"`);

    // Información de la cuenta a la que se sube el video
    const accountInfo = {
      username: "miequipo_oficial",
      profileUrl: "https://www.tiktok.com/@miequipo_oficial"
    };

    // Simulamos una carga exitosa
    // En una implementación real, aquí procesarías la respuesta de la API de TikTok
    const videoId = Math.floor(Math.random() * 1000000000).toString();

    return NextResponse.json({
      success: true,
      message: `Video subido exitosamente a la cuenta @${accountInfo.username}`,
      videoDetails: {
        name: videoFile.name,
        size: videoFile.size,
        caption: caption,
        // En una implementación real, aquí incluirías el ID del video en TikTok y otros detalles
        tiktokUrl: `https://www.tiktok.com/@${accountInfo.username}/video/${videoId}`,
        account: {
          username: accountInfo.username,
          profileUrl: accountInfo.profileUrl
        }
      }
    });

  } catch (error) {
    console.error("Error al subir el video a TikTok:", error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Error desconocido al subir el video"
      },
      { status: 500 }
    );
  }
}

export const config = {
  api: {
    bodyParser: false, // Deshabilitar el análisis del cuerpo para manejar FormData
  },
};
