"use client";

import { Metadata } from 'next';
import { Video, Wand2, Zap, Sparkles, Star, Users, ArrowRight, Play, MessageSquare, Mic2, Images, Split, Download, FileText, Menu } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState, useEffect } from 'react';

const features = [
  {
    title: 'Fake Text Videos',
    description: 'Have an idea for a convo that would go viral? Make it into a full video in just a few clicks.',
    icon: <MessageSquare className="h-6 w-6 text-blue-500" />,
    color: 'bg-blue-500/10',
    borderColor: 'border-blue-500/20',
    image: '/features/fake-text.webp',
    size: 'third'
  },
  {
    title: 'Generate AI Voiceovers',
    description: "It's never been easier to make AI-narrated videos you see on your timeline.",
    icon: <Mic2 className="h-6 w-6 text-purple-500" />,
    color: 'bg-purple-500/10',
    borderColor: 'border-purple-500/20',
    image: '/features/voiceover.webp',
    size: 'third'
  },
  {
    title: 'Create videos with Reddit overlays',
    description: 'Write your own script or generate one auto-magically from a Reddit link.',
    icon: <FileText className="h-6 w-6 text-red-500" />,
    color: 'bg-red-500/10',
    borderColor: 'border-red-500/20',
    image: '/features/reddit-overlay.webp',
    size: 'third'
  },
  {
    title: 'Split-screen Videos',
    description: 'Make your clips more engaging by showing them beside premium gameplay.',
    icon: <Split className="h-6 w-6 text-yellow-500" />,
    color: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/20',
    image: '/features/split-screen.webp',
    size: 'half'
  },
  {
    title: 'Text-to-Image Videos',
    description: 'Generate viral images for your videos with text prompts.',
    icon: <Images className="h-6 w-6 text-green-500" />,
    color: 'bg-green-500/10',
    borderColor: 'border-green-500/20',
    image: '/features/text-to-image.webp',
    size: 'half'
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
    answer: "Our AI analyzes Reddit posts and automatically creates engaging videos with voiceovers, background footage, and captions. Just paste a Reddit URL and let the magic happen."
  },
  {
    question: "What type of content can I create?",
    answer: "You can create story-time videos, Reddit readings, gaming commentaries, and more. Our AI supports multiple video styles and can adapt to different content types."
  },
  {
    question: "Is the generated voice customizable?",
    answer: "Yes! Choose from hundreds of AI voices in multiple languages and accents. You can adjust tone, speed, and emphasis to match your style."
  },
  {
    question: "How long does it take to create a video?",
    answer: "Most videos are generated within 2-3 minutes. The exact time depends on the length of the content and the customizations you choose."
  }
];

const navItems = [
  {
    label: 'Create',
    href: '/reddit-video'
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

export default function LandingPage() {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const isScrolled = window.scrollY > 10;
      if (isScrolled !== scrolled) {
        setScrolled(isScrolled);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [scrolled]);

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
    <div className="flex flex-col min-h-[100dvh] bg-gradient-to-b from-black to-gray-950 text-white">
      {/* Background Gradient */}
      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-pink-500/20 opacity-30 blur-3xl" />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 transition-all duration-300">
        <div
          className={`absolute inset-0 bg-gradient-to-b transition-all duration-300 backdrop-blur-sm
            ${scrolled
              ? 'from-black/60 to-black/40'
              : 'from-black/0 to-black/0'
            }`}
        />

        <div className="relative max-w-5xl mx-auto px-4">
          <div className="flex items-center justify-between h-20 relative">
            {/* Logo */}
            <div className="w-32">
              <Link href="/" className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500/80 to-purple-500/80 p-[1px] backdrop-blur-sm">
                  <div className="w-full h-full rounded-lg bg-black flex items-center justify-center">
                    <Video className="w-4 h-4 text-white" />
                  </div>
                </div>
                <span className="text-lg font-semibold">
                  Crayo
                </span>
              </Link>
            </div>

            {/* Center Navigation */}
            <nav className="hidden md:flex items-center absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="flex items-center gap-8">
                {navItems.map((item, index) => (
                  <Link
                    key={index}
                    href={item.href}
                    className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </nav>

            {/* Actions */}
            <div className="w-32 flex items-center justify-end gap-3">
              <Link href="/login" className="hidden md:block">
                <button className="whitespace-nowrap px-3 py-2 text-sm text-gray-300 hover:text-white transition-colors">
                  Log in
                </button>
              </Link>
              <Link href="/reddit-video">
                <button className="whitespace-nowrap px-3 py-2 text-sm font-medium bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-all">
                  Try Demo
                </button>
              </Link>

              {/* Mobile Menu */}
              <button className="md:hidden p-2 hover:bg-white/5 rounded-lg transition-colors">
                <Menu className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu Panel */}
        <div className="md:hidden">
          <div className="px-4 py-2 space-y-1 border-t border-white/10 bg-black/95 backdrop-blur-sm">
            {navItems.map((item, index) => (
              <Link
                key={index}
                href={item.href}
                className="block px-3 py-2 text-sm text-gray-300 hover:text-white transition-colors"
              >
                {item.label}
              </Link>
            ))}
            <Link href="/login">
              <button className="block w-full text-left px-3 py-2 text-sm text-gray-300 hover:text-white transition-colors">
                Log in
              </button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-grow relative z-10 pt-28">
        {/* Hero Section */}
        <section className="relative overflow-hidden pb-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <div className="rounded-full border border-blue-500/20 bg-blue-500/10 px-4 py-1.5 text-sm text-neutral-300 inline-block mb-6">
                <span className="mr-2">✨</span> Reddit Video Generator
              </div>
              <h1 className="text-4xl font-bold tracking-tight sm:text-6xl md:text-7xl mb-6">
                Turn Reddit Posts into
                <span className="block bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
                  Viral Videos
                </span>
              </h1>
              <p className="max-w-2xl mx-auto text-gray-400 text-lg mb-8">
                Create engaging social media videos from Reddit posts automatically.
                Perfect for content creators and social media managers.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
                <Link href="/reddit-video" className="w-full sm:w-auto">
                  <button className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 group">
                    Try Demo
                    <Play className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </button>
                </Link>

                <button
                  onClick={() => document.getElementById('waitlist')?.scrollIntoView({ behavior: 'smooth' })}
                  className="w-full sm:w-auto bg-white/10 hover:bg-white/20 text-white px-8 py-4 rounded-xl font-semibold transition-all border border-white/20"
                >
                  Join Waitlist
                </button>
              </div>
            </div>

            {/* Features Grid Layout */}
            <div className="mt-20 max-w- mx-auto">
              <div className="grid grid-cols-6 gap-4">
                {features.map((feature, index) => {
                  const sizeClasses = {
                    third: 'col-span-2',
                    half: 'col-span-3',
                    full: 'col-span-6'
                  }[feature.size || 'third'];

                  return (
                    <div
                      key={index}
                      className={`group ${sizeClasses} transition-all duration-300 hover:scale-[1.01] cursor-pointer`}
                    >
                      <div
                        className={`relative h-full rounded-xl overflow-hidden border ${feature.borderColor}
                                   backdrop-blur-sm bg-white/5`}
                      >
                        <div className="p-6 relative flex flex-col h-full">
                          {/* Header */}
                          <div>
                            <h3 className="text-xl font-semibold text-white mb-2">
                              {feature.title}
                            </h3>
                            <p className="text-gray-300 text-sm">
                              {feature.description}
                            </p>
                          </div>

                          {/* Preview Image Area */}
                          <div className="mt-4 relative">
                            <Image
                              src={feature.image}
                              alt={feature.title}
                              width={400}
                              height={200}
                              className="rounded-lg object-cover w-full"
                            />
                          </div>
                        </div>

                        {/* Hover Effect */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent
                                      opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Clips Section */}
        <div className="mt-32 max-w-7xl mx-auto px-4">
          <div className="text-center mb-8">
            <h2 className="text-4xl font-bold mb-4">
              <span className="text-white">2.5M clips made by </span>
              <span className="text-blue-500">700K+ Creators</span>
            </h2>
            <p className="text-gray-400 text-lg">
              Clip like a Pro: Crayo's AI tools help you catch trends
              <br />and create content that goes viral.
            </p>
          </div>

          {/* Clips Grid */}
          <div className="relative my-12">
            <div className="flex gap-6 overflow-hidden mask-fade">
              <div className="flex gap-6 animate-slide">
                {clips.map((clip, index) => (
                  <div
                    key={index}
                    className="relative flex-shrink-0 w-[200px] aspect-[9/16] rounded-xl overflow-hidden group cursor-pointer"
                  >
                    <video
                      src={clip.video}
                      autoPlay
                      muted
                      loop
                      playsInline
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300" />
                    <div className="absolute bottom-3 left-3 text-white font-medium opacity-0 group-hover:opacity-100 transition-all duration-300">
                      {clip.title}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-6 animate-slide" aria-hidden="true">
                {clips.map((clip, index) => (
                  <div
                    key={index}
                    className="relative flex-shrink-0 w-[200px] aspect-[9/16] rounded-xl overflow-hidden group cursor-pointer"
                  >
                    <video
                      src={clip.video}
                      autoPlay
                      muted
                      loop
                      playsInline
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300" />
                    <div className="absolute bottom-3 left-3 text-white font-medium opacity-0 group-hover:opacity-100 transition-all duration-300">
                      {clip.title}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>


          {/* Try Now Button */}
          <div className="text-center mt-16">
            <Link href="/reddit-video">
              <button className="bg-blue-500 hover:bg-blue-600 text-white px-8 py-3 rounded-full font-semibold transition-all">
                Try Crayo Now
              </button>
            </Link>
          </div>
        </div>

        {/* Waitlist Section */}
        <section id="waitlist" className="py-20 relative">
          <div className="absolute inset-0 bg-gradient-to-b from-blue-500/20 via-purple-500/20 to-transparent opacity-30 blur-3xl" />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-3xl font-bold mb-4">Join the Waitlist</h2>
              <p className="text-gray-400 mb-8">
                Be among the first to access our AI-powered Reddit video generator.
                Early access members get special pricing and features.
              </p>

              {submitted ? (
                <div className="bg-green-500/20 border border-green-500/30 rounded-xl p-6 backdrop-blur-sm">
                  <h3 className="text-xl font-semibold text-white mb-2">🎉 You're on the list!</h3>
                  <p className="text-gray-300">
                    We'll notify you when we launch. Meanwhile, why not try our demo?
                  </p>
                  <Link href="/reddit-video">
                    <button className="mt-4 bg-white/10 hover:bg-white/20 text-white px-6 py-2 rounded-lg font-medium transition-all">
                      Try Demo
                    </button>
                  </Link>
                </div>
              ) : (
                <form onSubmit={handleWaitlistSubmit} className="flex gap-4 max-w-md mx-auto">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    required
                    className="flex-grow px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? 'Joining...' : 'Join Now'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </section>


        {/* FAQ Section */}
        <div className="mt-16 max-w-4xl mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold mb-4">
                Frequently Asked Questions
              </h2>
              <p className="text-gray-400">
                Everything you need to know about our AI video generator
              </p>
            </div>

            <div className="grid gap-6">
              {faqs.map((faq, index) => (
                <div
                  key={index}
                  className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm hover:bg-white/10 transition-all duration-300"
                >
                  <div className="p-6">
                    <div className="flex items-center gap-4">
                      <div className="flex-shrink-0 h-8 w-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                        <span className="text-blue-500 font-semibold">{index + 1}</span>
                      </div>
                      <h3 className="text-lg font-semibold text-white">
                        {faq.question}
                      </h3>
                    </div>
                    <div className="mt-4 pl-12 text-gray-400">
                      {faq.answer}
                    </div>
                  </div>

                  {/* Decorative Elements */}
                  <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-blue-500/10 blur-2xl group-hover:bg-blue-500/20 transition-all duration-300" />
                  <div className="absolute bottom-0 left-0 -mb-4 -ml-4 h-24 w-24 rounded-full bg-purple-500/10 blur-2xl group-hover:bg-purple-500/20 transition-all duration-300" />
                </div>
              ))}
            </div>
          </div>



      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 py-8 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center text-gray-400 text-sm">
            © 2024 Reddit Video Generator. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
