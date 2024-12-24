declare module 'videocontext' {
  export default class VideoContext {
    constructor(canvas: HTMLCanvasElement);
    video(url: string): any;
    effect(callback: (ctx: CanvasRenderingContext2D) => void): any;
    play(): void;
    destination: any;
    onended: () => void;
  }
}
