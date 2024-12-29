import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Reddit Video Generator - Create Viral Videos from Reddit Posts',
  description: 'Transform Reddit posts into engaging social media videos automatically with AI. Perfect for content creators and social media managers.',
  keywords: [
    'reddit video generator',
    'social media content',
    'viral videos',
    'content creation',
    'reddit to video',
    'AI video generator',
    'automated video creation',
    'social media tools'
  ],
  openGraph: {
    title: 'Reddit Video Generator',
    description: 'Create viral videos from Reddit posts automatically',
    images: ['/og-image.png'],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
