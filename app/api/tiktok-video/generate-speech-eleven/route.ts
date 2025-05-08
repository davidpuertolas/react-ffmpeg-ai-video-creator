import { NextResponse } from "next/server";
import axios from "axios";

export async function POST(request: Request) {
    try {
        const { text = "Hola, este es un video de TikTok" } = await request.json();

        // Usar la API REST con el modelo v2
        const response = await axios({
            method: 'POST',
            url: 'https://api.elevenlabs.io/v1/text-to-speech/CaSq6tBcNiorITfv816h',
            headers: {
                'Accept': 'audio/mpeg',
                'Content-Type': 'application/json',
                'xi-api-key': 'sk_9df1fc6a4de83f37e12968591c18f7bc60470c21aa60fd99'
            },
            data: {
                text: text,
                model_id: "eleven_flash_v2_5", //eleven_flash_v2.5
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75,
                    style: 0.5,
                    use_speaker_boost: true
                }
            },
            responseType: 'arraybuffer'
        });

        // Devolver el audio como respuesta
        return new Response(response.data, {
            headers: {
                'Content-Type': 'audio/mpeg'
            }
        });
    } catch (error) {
        console.error("Error al generar voz:", error);

        // Crear un mensaje de error más detallado
        let errorMessage = "Error al generar la voz";
        if (error.response) {
            // Error de la API de ElevenLabs
            errorMessage += `: ${error.response.status} - ${error.response.statusText}`;
            try {
                // Intentar extraer más detalles si están disponibles
                const errorData = JSON.parse(error.response.data.toString());
                if (errorData.detail) {
                    errorMessage += ` - ${errorData.detail}`;
                }
            } catch (e) {
                // Si no podemos analizar la respuesta, usamos el mensaje genérico
            }
        } else if (error.message) {
            errorMessage += `: ${error.message}`;
        }

        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
