"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Squares2X2Icon,
  VideoCameraIcon,
  FolderIcon,
  Cog6ToothIcon,
  UserGroupIcon,
  ArrowLeftIcon
} from '@heroicons/react/24/outline';
import { Pencil } from 'lucide-react';
import ProfileMenu from '@/app/components/ProfileMenu';

const navigation = [
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: Squares2X2Icon
  },
  {
    name: 'Video Generator',
    href: '/reddit-video',
    icon: VideoCameraIcon
  },
  {
    name: 'Video Editor',
    href: '/video-editor',
    icon: Pencil
  },
  {
    name: 'My Projects',
    href: '/projects',
    icon: FolderIcon
  }
];

const secondaryNavigation = [
  {
    name: 'Settings',
    href: '/settings',
    icon: Cog6ToothIcon
  },
  {
    name: 'Community',
    href: 'https://discord.gg/your-server',
    icon: UserGroupIcon,
    external: true
  }
];

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname();
  const isLanding = pathname === '/';

  if (isLanding) {
    return children;
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 w-64 bg-white border-r border-gray-200">
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="h-16 flex items-center px-6 border-b border-gray-200">
            <Link href="/dashboard">
              <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                RedditVids
              </span>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-6">
            {/* Primary Navigation */}
            <div>
              <div className="px-2 mb-3">
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tools
                </h3>
              </div>
              {navigation.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`
                      flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg
                      ${isActive
                        ? 'text-blue-600 bg-blue-50'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      }
                    `}
                  >
                    <item.icon className="w-5 h-5" />
                    {item.name}
                  </Link>
                );
              })}
            </div>

            {/* Secondary Navigation */}
            <div>
              <div className="px-2 mb-3">
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  More
                </h3>
              </div>
              {secondaryNavigation.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  target={item.external ? '_blank' : undefined}
                  rel={item.external ? 'noopener noreferrer' : undefined}
                  className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-600 rounded-lg hover:text-gray-900 hover:bg-gray-50"
                >
                  <item.icon className="w-5 h-5" />
                  {item.name}
                </Link>
              ))}
            </div>
          </nav>

          {/* Pro Upgrade */}
          <div className="p-4 border-t border-gray-200">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-4 text-white">
              <h4 className="font-medium mb-1">Upgrade to Pro</h4>
              <p className="text-sm text-blue-100 mb-3">
                Get access to all features
              </p>
              <button className="w-full bg-white/20 hover:bg-white/30 backdrop-blur-sm text-sm font-medium px-3 py-1.5 rounded-lg transition-colors">
                Upgrade Now
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="pl-64">
        {/* Top navigation */}
        <header className="h-16 bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="h-full px-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {pathname !== '/dashboard' && (
                <Link
                  href="/dashboard"
                  className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
                >
                  <ArrowLeftIcon className="w-4 h-4" />
                  <span className="text-sm font-medium">Back to Dashboard</span>
                </Link>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-3.5 py-1.5 rounded-lg text-sm font-medium hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 shadow-sm">
                Upgrade Pro
              </button>
              <ProfileMenu />
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
