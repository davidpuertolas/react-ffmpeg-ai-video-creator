"use client";

import Link from 'next/link';
import {
  VideoCameraIcon,
  PhotoIcon,
  MusicalNoteIcon,
  DocumentTextIcon,
  ArrowRightIcon,

} from '@heroicons/react/24/outline';
import {
  Pencil,
  MessageCircle,
 } from 'lucide-react';
import { useState } from 'react';

const tools = [

  {
    name: 'TikTok Video Generator',
    description: 'Generate viral TikTok content',
    icon: <MusicalNoteIcon className="w-6 h-6 text-pink-500" />,
    href: '/tiktok-video',
    color: 'bg-pink-500/10',
    borderColor: 'border-pink-500/20',
    comingSoon: false
  },
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
    name: 'Chat Video Generator',
    description: 'Turn conversations into engaging videos',
    icon: <MessageCircle className="w-6 h-6 text-purple-500" />,
    href: '/chat-video',
    color: 'bg-purple-500/10',
    borderColor: 'border-purple-500/20',
    comingSoon: false
  },
  {
    name: 'AI Video Editor',
    description: 'From raw videos to engaging stories',
    icon: <Pencil className="w-6 h-6 text-green-500" />,
    href: '/edit-video',
    color: 'bg-green-500/10',
    borderColor: 'border-green-500/20',
    comingSoon: true
  },
  {
    name: 'HopeCore Style',
    description: 'Turn videos into motivational videos',
    icon: <VideoCameraIcon className="w-6 h-6 text-blue-500" />,
    href: '/hopecore-video',
    color: 'bg-blue-500/10',
    borderColor: 'border-blue-500/20',
    comingSoon: true
  },
  {
    name: 'Long Video Generator',
    description: 'Turn ideas into longform videos',
    icon: <VideoCameraIcon className="w-6 h-6 text-purple-500" />,
    href: '/longo-video',
    color: 'bg-purple-500/10',
    borderColor: 'border-purple-500/20',
    comingSoon: true
  },
];

export default function DashboardPage() {
  const [showAllTools, setShowAllTools] = useState(false);
  const displayedTools = showAllTools ? tools : tools.slice(0, 4);

  return (
    <div className="max-w-4xl mx-auto px-4">
      {/* Welcome Section */}
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900 mb-1">
          Welcome to AI Video Generator
        </h1>
        <p className="text-gray-600 text-sm">
          Choose a tool to start creating your content
        </p>
      </div>

      {/* Tools Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {displayedTools.map((tool) => (
          <Link
            key={tool.name}
            href={tool.comingSoon ? '#' : tool.href}
            className={`relative group rounded-lg p-5 transition-all duration-300 hover:scale-[1.02] cursor-pointer
                      border ${tool.borderColor} backdrop-blur-sm ${tool.color}`}
          >
            {tool.comingSoon && (
              <div className="absolute top-2 right-2 px-2 pb-0.5  bg-gray-500/10 rounded-full">
                <span className=" text-[11px] font-medium text-gray-500">Coming Soon</span>
              </div>
            )}
            <div className="flex items-start gap-2">
              <div className="p-1.5 rounded-md bg-white/80">
                {tool.icon}
              </div>
              <div className="flex-grow min-w-0">
                <h3 className="text-sm font-semibold text-gray-900">
                  {tool.name}
                </h3>
                <p className="text-gray-600 text-xs mb-1 truncate">
                  {tool.description}
                </p>

              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Show More Button */}
      {!showAllTools && tools.length > 4 && (
        <button
          onClick={() => setShowAllTools(true)}
          className="mt-2 w-full py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900
                     border border-gray-200 rounded-lg transition-colors hover:border-gray-300"
        >
          Show More Tools
        </button>
      )}

      {/* Recent Projects Section */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">
            Recent Projects
          </h2>
          <Link
            href="/projects"
            className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
          >
            View All
          </Link>
        </div>

        {/* Empty State */}
        <div className="border border-dashed border-gray-200 rounded-lg p-4 text-center">
          <DocumentTextIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <h3 className="text-sm font-medium text-gray-900 mb-1">
            No projects yet
          </h3>
          <p className="text-gray-600 text-xs mb-2">
            Create your first video by selecting one of the tools above
          </p>
          <Link
            href="/reddit-video"
            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
          >
            Create First Video
            <ArrowRightIcon className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
