"use client";

import Link from 'next/link';
import {
  VideoCameraIcon,
  PhotoIcon,
  MusicalNoteIcon,
  DocumentTextIcon,
  ArrowRightIcon
} from '@heroicons/react/24/outline';

const tools = [
  {
    name: 'Reddit Video Generator',
    description: 'Turn Reddit posts into engaging videos',
    icon: <VideoCameraIcon className="w-6 h-6 text-blue-500" />,
    href: '/reddit-video',
    color: 'bg-blue-500/10',
    borderColor: 'border-blue-500/20',
    comingSoon: false
  },
  {
    name: 'YouTube Shorts',
    description: 'Create vertical short-form videos',
    icon: <VideoCameraIcon className="w-6 h-6 text-purple-500" />,
    href: '/youtube-shorts',
    color: 'bg-purple-500/10',
    borderColor: 'border-purple-500/20',
    comingSoon: true
  },
  {
    name: 'TikTok Generator',
    description: 'Generate viral TikTok content',
    icon: <MusicalNoteIcon className="w-6 h-6 text-pink-500" />,
    href: '/tiktok',
    color: 'bg-pink-500/10',
    borderColor: 'border-pink-500/20',
    comingSoon: true
  },
  {
    name: 'Story Generator',
    description: 'Create engaging story videos',
    icon: <DocumentTextIcon className="w-6 h-6 text-green-500" />,
    href: '/story',
    color: 'bg-green-500/10',
    borderColor: 'border-green-500/20',
    comingSoon: true
  }
];

export default function DashboardPage() {
  return (
    <div className="max-w-6xl mx-auto">
      {/* Welcome Section */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Welcome to Reddit Video Generator
        </h1>
        <p className="text-gray-600">
          Choose a tool to start creating your content
        </p>
      </div>

      {/* Tools Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {tools.map((tool) => (
          <Link
            key={tool.name}
            href={tool.comingSoon ? '#' : tool.href}
            className={`relative group rounded-2xl p-6 transition-all duration-300 hover:scale-[1.02] cursor-pointer
                      border ${tool.borderColor} backdrop-blur-sm ${tool.color}`}
          >
            {tool.comingSoon && (
              <div className="absolute top-4 right-4 px-2 py-1 bg-gray-500/10 rounded-full">
                <span className="text-xs font-medium text-gray-500">Coming Soon</span>
              </div>
            )}
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-white/80">
                {tool.icon}
              </div>
              <div className="flex-grow">
                <h3 className="text-lg font-semibold text-gray-900 mb-1">
                  {tool.name}
                </h3>
                <p className="text-gray-600 text-sm mb-4">
                  {tool.description}
                </p>
                <div className="flex items-center text-sm font-medium text-gray-900 group-hover:gap-2 transition-all">
                  Get Started
                  <ArrowRightIcon className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Recent Projects Section */}
      <div className="mt-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">
            Recent Projects
          </h2>
          <Link
            href="/projects"
            className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
          >
            View All
          </Link>
        </div>

        {/* Empty State */}
        <div className="border border-dashed border-gray-200 rounded-2xl p-8 text-center">
          <DocumentTextIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No projects yet
          </h3>
          <p className="text-gray-600 text-sm mb-4">
            Create your first video by selecting one of the tools above
          </p>
          <Link
            href="/reddit-video"
            className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
          >
            Create First Video
            <ArrowRightIcon className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
