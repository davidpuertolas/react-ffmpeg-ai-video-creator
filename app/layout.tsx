import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from 'next/link';
import {
  Squares2X2Icon,
  PencilSquareIcon,
  FolderIcon,
  PhotoIcon,
  WrenchScrewdriverIcon,
  UserGroupIcon,
  Cog6ToothIcon
} from '@heroicons/react/24/outline';
import ProfileMenu from './components/ProfileMenu';
import { Inter } from "next/font/google";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Crayo - AI Video Editor",
  description: "Create and edit videos with AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans bg-[#FCFCFC]`}>
        <div className="flex">
          {/* Sidebar mejorado */}
          <aside className="w-48 h-screen bg-white/70 backdrop-blur-xl border-r border-gray-100 fixed left-0 top-0 flex flex-col">
            {/* Logo */}
            <div className="p-4 border-b border-gray-100/50">
              <img src="/logo.svg" alt="Crayo" className="h-6" />
            </div>

            {/* Navigation sections */}
            <div className="flex-1 p-4">
              {/* Dashboard section */}
              <div className="mb-8">
                <div className="flex items-center gap-2 text-gray-400 text-xs font-medium mb-3">
                  <Squares2X2Icon className="w-3.5 h-3.5" />
                  <span>Dashboard</span>
                </div>
                <nav className="space-y-0.5">
                  <Link href="/editor" className="block px-3 py-2 text-[13px] text-gray-600 hover:bg-gray-50/70 rounded-lg transition-colors">
                    Crayo Editor
                  </Link>
                  <Link href="/projects" className="block px-3 py-2 text-[13px] text-gray-600 hover:bg-gray-50/70 rounded-lg transition-colors">
                    My Projects
                  </Link>
                  <Link href="/exports" className="block px-3 py-2 text-[13px] text-gray-600 hover:bg-gray-50/70 rounded-lg transition-colors">
                    My Exports
                  </Link>
                  <Link href="/assets" className="block px-3 py-2 text-[13px] text-gray-600 hover:bg-gray-50/70 rounded-lg transition-colors">
                    My Assets
                  </Link>
                </nav>
              </div>

              {/* Tools section */}
              <div className="mb-8">
                <div className="flex items-center gap-2 text-gray-400 text-xs font-medium mb-3">
                  <WrenchScrewdriverIcon className="w-3.5 h-3.5" />
                  <span>Tools</span>
                </div>
                <nav className="space-y-0.5">
                  <a href="https://tubelabs.ai?ref=vidai" target="_blank" rel="noopener noreferrer"
                     className="block px-3 py-2 text-[13px] text-gray-600 hover:bg-gray-50/70 rounded-lg transition-colors flex items-center gap-2">
                    Miniaturas
                    <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                      <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                    </svg>
                  </a>
                  <a href="https://tubelabs.ai?ref=vidai" target="_blank" rel="noopener noreferrer"
                     className="block px-3 py-2 text-[13px] text-gray-600 hover:bg-gray-50/70 rounded-lg transition-colors flex items-center gap-2">
                    Guiones
                    <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                      <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                    </svg>
                  </a>
                  <Link href="/yt-downloader" className="block px-3 py-2 text-[13px] text-gray-600 hover:bg-gray-50/70 rounded-lg transition-colors">
                    YT Downloader
                  </Link>
                  <Link href="/tiktok-downloader" className="block px-3 py-2 text-[13px] text-gray-600 hover:bg-gray-50/70 rounded-lg transition-colors">
                    TikTok Downloader
                  </Link>
                </nav>
              </div>

              {/* More section */}
              <div>
                <div className="flex items-center gap-2 text-gray-400 text-xs font-medium mb-3">
                  <Cog6ToothIcon className="w-3.5 h-3.5" />
                  <span>More</span>
                </div>
                <nav className="space-y-0.5">
                  <Link href="/affiliate" className="block px-3 py-2 text-[13px] text-gray-600 hover:bg-gray-50/70 rounded-lg transition-colors">
                    Affiliate
                  </Link>
                  <Link href="/discord" className="block px-3 py-2 text-[13px] text-gray-600 hover:bg-gray-50/70 rounded-lg transition-colors">
                    Discord
                  </Link>
                </nav>
              </div>
            </div>
          </aside>

          {/* Main content */}
          <div className="flex-1 ml-48">
            {/* Top navigation */}
            <nav className="h-14 bg-white/70 backdrop-blur-xl border-b border-gray-100 flex items-center justify-between px-6 sticky top-0 z-10">
              <div className="flex items-center gap-2">
                <span className="text-gray-600 text-sm font-medium">Welcome back, David</span>
                <span>👋</span>
              </div>
              <div className="flex items-center gap-3">
                <button className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-3.5 py-1.5 rounded-lg text-sm font-medium hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 shadow-sm">
                  Upgrade
                </button>
                <ProfileMenu />
              </div>
            </nav>

            {/* Page content */}
            <main className="p-6">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
