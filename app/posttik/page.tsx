"use client";

import { useState, useRef, useEffect } from "react";

export default function TikTokPoster() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [userInfo, setUserInfo] = useState<{
    username: string;
    profilePicture: string;
  } | null>(null);
  const [uploadStatus, setUploadStatus] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file) {
      setVideoFile(file);
      // Create a preview URL for the video
      const url = URL.createObjectURL(file);
      setVideoPreviewUrl(url);
    }
  };

  const handleAuthenticate = async () => {
    setIsAuthenticating(true);
    setUploadStatus(null);

    try {
      // Authenticate with TikTok
      const authResponse = await fetch("/api/tiktok/auth");
      const authData = await authResponse.json();

      if (authData.success) {
        setIsAuthenticated(true);
        setUserInfo(authData.user);
        setUploadStatus({
          success: true,
          message: "¡Autenticación exitosa con TikTok!",
        });
      } else {
        throw new Error(authData.message || "Error de autenticación con TikTok");
      }
    } catch (error) {
      console.error("Error authenticating with TikTok:", error);
      setUploadStatus({
        success: false,
        message: error instanceof Error ? error.message : "Error desconocido en la autenticación",
      });
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleUpload = async () => {
    if (!videoFile) {
      setUploadStatus({
        success: false,
        message: "Por favor selecciona un video para subir",
      });
      return;
    }

    setIsUploading(true);
    setUploadStatus(null);

    try {
      // Upload the video
      const formData = new FormData();
      formData.append("video", videoFile);
      formData.append("caption", caption);

      const uploadResponse = await fetch("/api/tiktok/upload", {
        method: "POST",
        body: formData,
      });

      const uploadData = await uploadResponse.json();

      if (uploadResponse.ok) {
        setUploadStatus({
          success: true,
          message: `¡Video subido exitosamente a TikTok! Ver en: ${uploadData.videoDetails.tiktokUrl}`,
        });
        // Reset form
        setVideoFile(null);
        setCaption("");
        setVideoPreviewUrl(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      } else {
        throw new Error(uploadData.message || "Error al subir el video");
      }
    } catch (error) {
      console.error("Error uploading to TikTok:", error);
      setUploadStatus({
        success: false,
        message: error instanceof Error ? error.message : "Error desconocido al subir el video",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="container mx-auto py-10 max-w-3xl">
      <div className="bg-white shadow-md rounded-lg p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-2">Publicar Video en TikTok</h1>
          <p className="text-gray-600">
            Sube un video de tu equipo directamente a TikTok
          </p>
        </div>

        {!isAuthenticated ? (
          <div className="text-center py-8">
            <h2 className="text-xl mb-4">Primero necesitas autenticarte con TikTok</h2>
            <button
              onClick={handleAuthenticate}
              disabled={isAuthenticating}
              className="bg-[#fe2c55] hover:bg-[#e6254d] text-white font-bold py-3 px-6 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAuthenticating ? (
                <span className="flex items-center justify-center">
                  <svg
                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Autenticando...
                </span>
              ) : (
                "Iniciar sesión con TikTok"
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {userInfo && (
              <div className="bg-gray-50 p-4 rounded-lg flex items-center">
                <img
                  src={userInfo.profilePicture}
                  alt={`Perfil de ${userInfo.username}`}
                  className="w-12 h-12 rounded-full mr-4"
                />
                <div>
                  <p className="font-medium">Subiendo como:</p>
                  <p className="text-lg font-bold text-[#fe2c55]">@{userInfo.username}</p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="video" className="block text-sm font-medium text-gray-700">
                Seleccionar Video
              </label>
              <input
                ref={fileInputRef}
                id="video"
                type="file"
                accept="video/*"
                onChange={handleFileChange}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>

            {videoPreviewUrl && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700">Vista Previa</label>
                <div className="mt-2 rounded-md overflow-hidden bg-black">
                  <video
                    src={videoPreviewUrl}
                    controls
                    className="w-full max-h-[400px]"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="caption" className="block text-sm font-medium text-gray-700">
                Descripción
              </label>
              <textarea
                id="caption"
                placeholder="Escribe una descripción para tu video..."
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={3}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
              />
            </div>

            <button
              onClick={handleUpload}
              disabled={isUploading || !videoFile}
              className="w-full bg-[#fe2c55] hover:bg-[#e6254d] text-white font-bold py-3 px-6 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUploading ? (
                <span className="flex items-center justify-center">
                  <svg
                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Subiendo...
                </span>
              ) : (
                <span className="flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                  Publicar en TikTok
                </span>
              )}
            </button>
          </div>
        )}

        {uploadStatus && (
          <div className={`mt-6 p-4 rounded-md ${uploadStatus.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
            <div className="flex">
              <div className="flex-shrink-0">
                {uploadStatus.success ? (
                  <svg className="h-5 w-5 text-green-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium">
                  {uploadStatus.success ? "Éxito" : "Error"}
                </h3>
                <div className="mt-2 text-sm">
                  <p>{uploadStatus.message}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
