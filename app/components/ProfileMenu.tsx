"use client";

import { useState } from "react";
import Link from "next/link";

export default function ProfileMenu() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        className="w-8 h-8 bg-[#00BA88] rounded-full flex items-center justify-center text-white font-medium"
      >
        D
      </button>

      {isMenuOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg py-1 border border-gray-100">
          <Link
            href="/settings"
            className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Settings
          </Link>
          <Link
            href="/upgrade"
            className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Upgrade
          </Link>
          <Link
            href="/help"
            className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Help & Support
          </Link>
          <button
            onClick={() => {
              // Aquí irá la lógica de logout
              console.log("Logout clicked");
            }}
            className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-50"
          >
            Log Out
          </button>
        </div>
      )}
    </div>
  );
}
