"use client";

import { usePathname } from 'next/navigation';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';

export default function PagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isDashboard = pathname === '/';

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      {/* Top navigation */}
      {!isDashboard && (
        <div className="h-14 bg-white border-b border-gray-100">
          <div className="max-w-7xl mx-auto px-6 h-full flex items-center">
            <Link
              href="/"
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeftIcon className="w-4 h-4" />
              <span className="text-sm font-medium">Back to Dashboard</span>
            </Link>
          </div>
        </div>
      )}

      {/* Page content */}
      {children}
    </div>
  );
}
