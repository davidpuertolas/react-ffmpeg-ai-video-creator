let ffmpeg: any;
let fetchFile: any;

export async function loadFFmpeg() {
  if (!ffmpeg) {
    const ffmpegModule = await import('@ffmpeg/ffmpeg');
    ffmpeg = ffmpegModule.createFFmpeg({ log: true });
    fetchFile = ffmpegModule.fetchFile;
    await ffmpeg.load();
  }
}

export { ffmpeg, fetchFile };
