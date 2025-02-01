"use client";

import { Metadata } from 'next';
import { Video, Wand2, Zap, Sparkles, Star, Users, ArrowRight, Play, MessageSquare, Mic2, Images, Split, Download, FileText, Menu, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState, useEffect } from 'react';

const features = [
  {
    title: 'Fake Texts Videos',
    description: 'Have an idea for a convo that would go viral? Make it into a full video in just a few clicks.',
    icon: <MessageSquare className="h-6 w-6 text-blue-500" />,
    image: '/features/fake-text.webp'
  },
  {
    title: 'Generate AI Voiceovers',
    description: "It's never been easier to make AI-narrated videos you see on your timeline.",
    icon: <Mic2 className="h-6 w-6 text-purple-500" />,
    image: '/features/voiceover.webp'
  },
  {
    title: 'Create Story Videos',
    description: 'Write your own script or generate one auto-magically with AI.',
    icon: <FileText className="h-6 w-6 text-red-500" />,
    image: '/features/story.webp'
  }
];

const clips = [
  {
    title: 'talking',
    video: '/minecraft-vertical.mp4',
  },
  {
    title: 'married',
    video: '/minecraft-vertical.mp4',
  },
  {
    title: 'that',
    video: '/minecraft-vertical.mp4',
  },
  {
    title: 'cognitive',
    video: '/minecraft-vertical.mp4',
  },
  {
    title: 'haunts',
    video: '/minecraft-vertical.mp4',
  },
  {
    title: 'breaking',
    video: '/minecraft-vertical.mp4',
  },
  {
    title: 'gaming',
    video: '/minecraft-vertical.mp4',
  },
  {
    title: 'building',
    video: '/minecraft-vertical.mp4',
  },
  {
    title: 'crafting',
    video: '/minecraft-vertical.mp4',
  },
  {
    title: 'appealing',
    video: '/minecraft-vertical.mp4',
  },
  {
    title: 'viral',
    video: '/minecraft-vertical.mp4',
  }
];

const faqs = [
  {
    question: "How does the AI video generation work?",
    answer: "Our AI helps you create engaging TikTok videos by generating scripts, voiceovers, and visuals. Simply choose your video style, customize the content, and let our AI do the magic."
  },
  {
    question: "What type of content can I create?",
    answer: "You can create storytelling videos, AI chat conversations, gaming commentaries, and more. Our AI supports multiple video styles popular on TikTok and other social platforms."
  },
  {
    question: "Is the generated voice customizable?",
    answer: "Yes! Choose from hundreds of AI voices in multiple languages and accents. You can adjust tone, speed, and emphasis to match your style and create unique character voices."
  },
  {
    question: "How long does it take to create a video?",
    answer: "Most videos are generated within 2-3 minutes. Perfect for creating multiple TikTok videos quickly while maintaining high quality and engagement."
  }
];

const navItems = [
  {
    label: 'Create',
    href: '/chat-video'
  },
  {
    label: 'Examples',
    href: '#examples'
  },
  {
    label: 'Pricing',
    href: '#pricing'
  }
];

const testimonials = [
  {
    name: '@creativecreator',
    handle: 'TikTok Creator',
    avatar: '/avatars/creator1.jpg',
    text: 'This tool has completely changed my content creation game. I can make viral videos in minutes!',
    followers: '2.5M'
  },
  {
    name: '@viralking',
    handle: 'Content Creator',
    avatar: '/avatars/creator2.jpg',
    text: 'The AI voice cloning is incredible. My followers cant tell the difference!',
    followers: '1.2M'
  },
  {
    name: '@storyteller',
    handle: 'Storytelling Creator',
    avatar: '/avatars/creator3.jpg',
    text: 'The story generator helps me create unique content every single day.',
    followers: '800K'
  }
];

const stats = [
  {
    number: '10M+',
    label: 'Videos Created'
  },
  {
    number: '500K+',
    label: 'Active Creators'
  },
  {
    number: '2B+',
    label: 'Views Generated'
  }
];

const StarRating = () => (
  <div className="inline-flex items-center gap-2 mb-2.5 bg-gray-300/20 rounded-full p-2">
    <div className="flex gap-0.5">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="relative">
          {i === 4 ? (
            <>
              <div className="absolute inset-0 w-1/2 overflow-hidden">
                <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
              </div>
              <Star className="w-5 h-5 text-gray-300 fill-gray-300" />
            </>
          ) : (
            <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
          )}
        </div>
      ))}
    </div>
    <span className="text-[15px] text-gray-600 font-medium">
      <span className="text-gray-800">+20k</span> users worldwide
    </span>
  </div>
);

const NavItem = ({ label, children }: { label: string, children?: React.ReactNode }) => (
  <div className="group relative">
    <button className="flex items-center gap-1 text-[15px] text-gray-800 hover:text-gray-900">
      {label}
      {children && (
        <ChevronRight className="w-4 h-4 transform rotate-90 opacity-50" />
      )}
    </button>
    {children && (
      <div className="absolute top-full left-0 pt-2 hidden group-hover:block">
        {children}
      </div>
    )}
  </div>
);

const DecorativePatterns = () => (
  <>
    {/* Patrón de puntos izquierdo */}
    <div className="absolute left-0 top-44 w-[330px] h-[330px] opacity-15">
      <div className="relative w-full h-full">
        <div className="absolute w-full h-full bg-[url('/patterns/dots.svg')] bg-repeat-space" />
        <div className="absolute -left-20 -top-20 w-[500px] h-[500px] rounded-full border-[50px] border-yellow-400/20 -rotate-45" />
      </div>
    </div>

    {/* Patrón de puntos derecho */}
    <div className="absolute right-0 top-44 w-[330px] h-[330px] opacity-15">
      <div className="relative w-full h-full">
        <div className="absolute w-full h-full bg-[url('/patterns/dots.svg')] bg-repeat-space" />
        <div className="absolute -right-20 -top-20 w-[500px] h-[500px] rounded-full border-[50px] border-yellow-400/20 rotate-45" />
      </div>
    </div>
  </>
);

export default function LandingPage() {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Here you would integrate with your waitlist service
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulated API call
      setSubmitted(true);
    } catch (error) {
      console.error('Error submitting to waitlist:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white overflow-hidden">
      {/* Header */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled ? 'bg-white/80 backdrop-blur-sm border-b border-gray-200' : ''
      }`}>
        <div className="max-w-7xl mx-auto px-6">
          <nav className="relative flex items-center h-[72px]">
            {/* Logo - Posición absoluta */}
            <div className="absolute left-0">
              <Link href="/" className="flex items-center">
                <Image
                  src="/logo.png"
                  alt="Crayo"
                  width={100}
                  height={32}
                  className="w-auto h-8"
                />
              </Link>
            </div>

            {/* Navegación central - Centrado absoluto */}
            <div className="hidden md:flex items-center justify-center w-full mt-1">
              <div className="flex items-center gap-8">
                <NavItem label="Features">
                  {/* Dropdown content */}
                </NavItem>
                <NavItem label="Use Cases">
                  {/* Dropdown content */}
                </NavItem>
                <NavItem label="Resources">
                  {/* Dropdown content */}
                </NavItem>
                <Link
                  href="/pricing"
                  className="text-[15px] text-gray-800 hover:text-gray-900"
                >
                  Pricing
                </Link>
              </div>
            </div>

            {/* Botón - Posición absoluta */}
            <div className="absolute right-0">
              <Link href="/dashboard">
                <button className="flex items-center gap-1.5 px-5 py-2.5 bg-[#4354FF] hover:bg-[#3544cc] text-white text-[15px] font-medium rounded-full transition-colors">
                  <Zap className="w-4 h-4" />
                  Try Crayo Now
                </button>
              </Link>
            </div>

            {/* Botón móvil - Posición absoluta */}
            <div className="md:hidden absolute right-0">
              <button
                className="p-2"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                <Menu className="w-6 h-6 text-gray-800" />
              </button>
            </div>
          </nav>
        </div>
      </header>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 bg-white md:hidden">
          <div className="p-4">
            {/* Mobile menu content */}
          </div>
        </div>
      )}

      <main className="relative pt-32">
        {/* Elementos decorativos */}
        <DecorativePatterns />

        {/* Hero Section */}
        <section className="relative max-w-7xl mx-auto px-4 text-center">
          <StarRating />

          <h1 className="text-5xl md:text-[64px] font-bold text-gray-900 mb-6 leading-tight">
            Generate viral-ready clips
            <span className="block">in seconds</span>
          </h1>

          <p className="text-xl text-gray-500 max-w-2xl mx-auto mb-12">
            Your all-in-one tool for creating AI voiceovers,
            engaging subtitles optimized gameplay, and more.
          </p>

          <div className="flex items-center justify-center gap-4">


            <button
              onClick={() => {/* Función para mostrar demo */}}
              className="group inline-flex items-center gap-2 px-6 py-4 bg-gray-200 border-2 border-gray-300 text-gray-800 rounded-2xl font-medium 0 hover:border-gray-300 transition-all duration-300 hover:shadow-lg"
            >
              <div className="bg-gray-100 rounded-full p-2 group-hover:bg-gray-200 transition-colors">
                <Play className="w-5 h-5 text-gray-700" />
              </div>
              <span className="text-lg">Watch Demo</span>
            </button>

            <Link href="/dashboard">
              <button className="group relative inline-flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-[#4354FF] via-[#6366F1] to-[#4354FF] text-white rounded-2xl font-medium transition-all duration-300 hover:shadow-[0_0_50px_12px_rgba(67,84,255,0.3)] hover:scale-[1.02] border border-white/20 backdrop-blur-sm animate-gradient bg-[length:200%_auto]">
                {/* Efecto de brillo */}
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 group-hover:animate-shine" />

                {/* Efecto de borde brillante */}
                <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-[#4354FF] via-white/20 to-[#4354FF] opacity-0 group-hover:opacity-100 blur-sm transition-opacity duration-300" />

                {/* Contenido del botón */}
                <div className="relative flex items-center gap-3">
                  <div className="bg-white/20 rounded-full p-2">
                    <Zap className="w-6 h-6" />
                  </div>
                  <span className="text-xl font-semibold">Try Crayo Now</span>
                  <ArrowRight className="w-6 h-6 transform transition-transform duration-300 group-hover:translate-x-1" />
                </div>
              </button>
            </Link>


            
          </div>
        </section>

        {/* Features Grid */}
        <section className="max-w-7xl mx-auto px-4 py-24">
          <div className="grid md:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div key={index} className="rounded-2xl border border-gray-200 p-6 hover:shadow-lg transition-shadow">
                <div className="flex items-start gap-4 mb-6">
                  <div className="p-2 rounded-lg bg-gray-50">
                    {feature.icon}
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                      {feature.title}
                    </h3>
                    <p className="text-gray-600">
                      {feature.description}
                    </p>
                  </div>
                </div>
                <Image
                  src={feature.image}
                  alt={feature.title}
                  width={500}
                  height={300}
                  className="rounded-lg w-full"
                />
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-12">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center text-sm text-gray-600">
            © 2024 Crayo. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
