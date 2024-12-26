import { bundle } from '@remotion/bundler';
import { getCompositions, renderMedia } from '@remotion/renderer';
import path from 'path';

export const renderVideo = async (props: {
  title: string;
  comments: any[];
  isDarkMode: boolean;
}) => {
  // Crear el bundle
  const bundleLocation = await bundle(path.join(process.cwd(), 'remotion', 'index.tsx'));

  // Obtener la composición
  const compositions = await getCompositions(bundleLocation);
  const composition = compositions.find((c) => c.id === 'RedditVideo');

  if (!composition) {
    throw new Error('No composition found');
  }

  // Renderizar el video
  const outputLocation = path.join(process.cwd(), 'public', 'rendered', `video-${Date.now()}.mp4`);

  const renderResult = await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: 'h264',
    outputLocation,
    inputProps: props,
  });

  return renderResult;
};
