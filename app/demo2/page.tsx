'use client';

import { useState, useEffect } from 'react';
import { PEXELS_API_KEY } from '../config';

export default function ImageGenerator() {
  const [prompt, setPrompt] = useState('');
  const [images, setImages] = useState<Array<{url: string, photographer: string}>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Efectos para monitorear cambios de estado
  useEffect(() => {
    console.log('🔤 Prompt actualizado:', prompt);
  }, [prompt]);

  useEffect(() => {
    console.log('🖼️ Estado de imágenes actualizado:', images.length ? `${images.length} imágenes` : 'Sin imágenes');
  }, [images]);

  useEffect(() => {
    console.log('⚡ Estado de carga:', loading ? 'Cargando' : 'Inactivo');
  }, [loading]);

  useEffect(() => {
    if (error) {
      console.log('❌ Error actualizado:', error);
    }
  }, [error]);

  const searchImages = async () => {
    console.log('🔍 Iniciando búsqueda de imágenes...');
    console.log('📝 Prompt recibido:', prompt);

    if (!prompt) {
      console.warn('⚠️ No se proporcionó ningún término de búsqueda');
      setError('Por favor ingresa qué quieres buscar');
      return;
    }

    try {
      console.log('🔄 Iniciando proceso de carga...');
      setLoading(true);
      setError('');
      setImages([]);

      console.log('🌐 Realizando petición a Pexels API...');
      const response = await fetch(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(prompt)}&per_page=8`,
        {
          headers: {
            'Authorization': "ZehD5q6AfkVWEPpIyclCpVzLsE7VJbmTkoTzB8u6KObxTcI4hMbOdwnA"
          }
        }
      );

      if (!response.ok) {
        throw new Error('Error en la petición a Pexels');
      }

      const data = await response.json();
      console.log('📦 Datos recibidos:', data);

      const processedImages = data.photos.map(photo => ({
        url: photo.src.large,
        photographer: photo.photographer
      }));

      console.log('📷 Imágenes procesadas:', processedImages);
      setImages(processedImages);

    } catch (err) {
      console.error('🚨 Error detectado:', err);
      setError('Ocurrió un error al buscar las imágenes');
      console.error(err);
    } finally {
      console.log('🏁 Proceso finalizado');
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Buscador de Imágenes Pexels</h1>

      <div className="space-y-4">
        <div>
          <label htmlFor="prompt" className="block text-sm font-medium mb-2">
            ¿Qué imágenes quieres buscar?
          </label>
          <input
            id="prompt"
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full p-2 border rounded-md"
            placeholder="Ej: naturaleza, ciudad, animales, etc."
          />
        </div>

        <button
          onClick={searchImages}
          disabled={loading}
          className="w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 disabled:bg-gray-400"
        >
          {loading ? 'Buscando...' : 'Buscar Imágenes'}
        </button>

        {error && (
          <p className="text-red-500">{error}</p>
        )}

        {loading && (
          <div className="text-center">
            <p className="animate-pulse">🔍 Buscando imágenes en Pexels...</p>
          </div>
        )}

        {images.length > 0 && (
          <div className="grid grid-cols-2 gap-4 mt-4">
            {images.map((image, index) => (
              <div key={index} className="aspect-square relative group">
                <img
                  src={image.url}
                  alt={`Imagen ${index + 1}`}
                  className="w-full h-full object-cover rounded-md"
                  onError={(e) => {
                    console.error('❌ Error al cargar imagen:', index);
                    e.currentTarget.src = 'https://via.placeholder.com/512x512?text=Error+al+cargar+imagen';
                  }}
                />
                <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white p-2 text-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  📸 Foto por: {image.photographer}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="text-center text-sm text-gray-500 mt-4">
          Imágenes proporcionadas por <a href="https://www.pexels.com" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Pexels</a>
        </div>
      </div>
    </div>
  );
}
