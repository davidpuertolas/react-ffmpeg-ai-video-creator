# VidAI 🎬✨

## AI-Powered Video Creation Made Simple

![VidAI](https://github.com/user-attachments/assets/7877b74b-8da6-4db8-94fb-f7e4d0cbf273)

VidAI is a cutting-edge web application that combines the power of AI with video editing capabilities, making video creation accessible to everyone. Built with React, Next.js, and FFmpeg, this tool enables users to create professional-quality videos with just a few clicks.

## ✨ Features

### 🤖 AI-Powered Video Generation
- **Story Generation**: Create engaging video scripts using AI
- **Voiceover Creation**: Generate natural-sounding narrations using advanced text-to-speech models
- **Visual Generation**: Automatically create images that match your story segments

### 🎥 Video Editing Capabilities
- **Automatic Video Assembly**: Combine images, audio, and effects seamlessly
- **Custom Subtitles**: Add professionally styled subtitles with customizable animation
- **Transition Effects**: Add smooth transitions between video segments
- **Background Music**: Add atmospheric music to enhance your videos

### 🧩 Specialized Video Formats
- **TikTok & Short-form Video**: Create vertical videos optimized for platforms like TikTok
- **Chat & Text Videos**: Generate conversation-based videos that simulate texting or chat interfaces
- **Reddit Story Videos**: Transform Reddit posts into engaging narrative videos

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ installed on your system
- FFmpeg (installed automatically as a dependency)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/vidai.git
cd vidai
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
Create a `.env.local` file in the root directory with the following variables:
```
OPENAI_API_KEY=your_openai_api_key
ELEVENLABS_API_KEY=your_elevenlabs_api_key
DEEPINFRA_API_KEY=your_deepinfra_api_key
```

4. Start the development server:
```bash
npm run dev
```

5. Open your browser and navigate to `http://localhost:3000`

## 🛠️ Technology Stack

- **Frontend**: React, Next.js, Tailwind CSS
- **Video Processing**: FFmpeg.js, VideoContext
- **AI Services**:
  - OpenAI: Script generation and text processing
  - ElevenLabs: Text-to-speech and voice synthesis
  - DeepInfra: Image generation

## 📚 How It Works

1. **Script Generation**: Input your idea, and the AI creates a compelling script for your video
2. **Audio Creation**: The system automatically generates voiceovers for your script
3. **Visual Elements**: AI generates images that match your story segments
4. **Video Assembly**: FFmpeg combines all elements into a seamless video with transitions
5. **Customization**: Add subtitles, music, and effects to enhance your video
6. **Export**: Download your video and share it on social media platforms

## 🖼️ Use Cases

- **Content Creators**: Quickly create engaging videos without extensive editing knowledge
- **Social Media Managers**: Generate platform-specific content in minutes
- **Educators**: Create educational content with clear narration and visuals
- **Marketers**: Develop promotional videos with minimal effort

## 📋 Project Structure

```
vidai/
├── app/                 # Next.js application
│   ├── (pages)/         # Page routes
│   ├── api/             # API routes
│   ├── components/      # React components
│   └── ...
├── public/              # Static assets
├── utils/               # Utility functions
│   └── ffmpeg.ts        # FFmpeg initialization
├── types/               # TypeScript definitions
└── ...
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 📞 Contact

For any questions or support, please open an issue in the GitHub repository.

---

Made with ❤️ using Next.js, React, and FFmpeg
