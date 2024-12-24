import { useState } from 'react';

interface CustomizeProps {
  title: string;
  // ... otras props
}

const Customize = ({ title, ...props }: CustomizeProps) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(true);

  const handleGenerateVideo = async () => {
    setIsGenerating(true);
    setPreviewVisible(false);

    try {
      await generateVideo();
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div>
      {previewVisible && (
        <div className="preview-container">
          <h2 className="preview-title">{title}</h2>
          {/* Resto de la preview */}
        </div>
      )}

      <button
        onClick={handleGenerateVideo}
        disabled={isGenerating}
        className={`generate-btn ${isGenerating ? 'disabled' : ''}`}
      >
        {isGenerating ? 'Generando...' : 'Generar Video'}
      </button>
    </div>
  );
};

export default Customize;
