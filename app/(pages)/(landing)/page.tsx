"use client";

import { useState } from "react";
import {
  VideoCameraIcon,
  ChatBubbleBottomCenterTextIcon,
  ScissorsIcon,
  SpeakerWaveIcon,
  DocumentTextIcon,
  CommandLineIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";


export default function Home() {
  return (
    <div className="min-h-screen bg-[#FAFAFA]">


      {/* Creation Tools Grid */}
      <div className="max-w-7xl mx-auto p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Reddit Videos */}
          <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-6 border border-gray-100">
            <div className="aspect-video w-full mb-4 rounded-lg overflow-hidden bg-gray-100">
              <img
                src="https://crayo.ai/assets/dashboard/fake-texts.png"
                alt="Reddit Video Demo"
                className="w-full h-full object-cover hover:scale-105 transition-transform duration-200"
              />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Reddit Videos</h3>
            <p className="text-gray-600 mb-4">
              Transform Reddit stories into engaging video content with AI narration
            </p>
            <Link href="/reddit-video" className="text-orange-600 font-medium hover:text-orange-700 flex items-center gap-2">
              Create Video
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

          {/* Fake Text Videos */}
          <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-6 border border-gray-100">
            <div className="aspect-video w-full mb-4 rounded-lg overflow-hidden bg-gray-100">
              <img
                src="https://crayo.ai/assets/dashboard/fake-texts.png"
                alt="Fake Texts Demo"
                className="w-full h-full object-cover hover:scale-105 transition-transform duration-200"
              />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Fake Text Videos</h3>
            <p className="text-gray-600 mb-4">
              Create realistic text message conversations and turn them into videos
            </p>
            <Link href="/fake-texts" className="text-blue-600 font-medium hover:text-blue-700 flex items-center gap-2">
              Create Video
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

          {/* ChatGPT Videos */}
          <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-6 border border-gray-100">
            <div className="aspect-video w-full mb-4 rounded-lg overflow-hidden bg-gray-100">
              <img
                src="https://crayo.ai/assets/dashboard/fake-texts.png"
                alt="ChatGPT Video Demo"
                className="w-full h-full object-cover hover:scale-105 transition-transform duration-200"
              />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">ChatGPT Videos</h3>
            <p className="text-gray-600 mb-4">
              Convert ChatGPT conversations into engaging video content
            </p>
            <Link href="/chatgpt" className="text-green-600 font-medium hover:text-green-700 flex items-center gap-2">
              Create Video
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

          {/* Split Videos */}
          <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-6 border border-gray-100">
            <div className="aspect-video w-full mb-4 rounded-lg overflow-hidden bg-gray-100">
              <img
                src="https://crayo.ai/assets/dashboard/fake-texts.png"
                alt="Split Video Demo"
                className="w-full h-full object-cover hover:scale-105 transition-transform duration-200"
              />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Split Videos</h3>
            <p className="text-gray-600 mb-4">
              Split your long videos into perfect short-form content
            </p>
            <Link href="/split" className="text-purple-600 font-medium hover:text-purple-700 flex items-center gap-2">
              Create Video
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

          {/* Voiceover Videos */}
          <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-6 border border-gray-100">
            <div className="aspect-video w-full mb-4 rounded-lg overflow-hidden bg-gray-100">
              <img
                src="https://crayo.ai/assets/dashboard/fake-texts.png"
                alt="Voiceover Video Demo"
                className="w-full h-full object-cover hover:scale-105 transition-transform duration-200"
              />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Voiceover Videos</h3>
            <p className="text-gray-600 mb-4">
              Add professional AI voiceovers to your video content
            </p>
            <Link href="/voiceover" className="text-pink-600 font-medium hover:text-pink-700 flex items-center gap-2">
              Create Video
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

          {/* Blur Videos */}
          <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-6 border border-gray-100">
            <div className="aspect-video w-full mb-4 rounded-lg overflow-hidden bg-gray-100">
              <img
                src="https://crayo.ai/assets/dashboard/fake-texts.png"
                alt="Blur Video Demo"
                className="w-full h-full object-cover hover:scale-105 transition-transform duration-200"
              />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Blur Videos</h3>
            <p className="text-gray-600 mb-4">
              Automatically blur sensitive content in your videos
            </p>
            <Link href="/blur" className="text-yellow-600 font-medium hover:text-yellow-700 flex items-center gap-2">
              Create Video
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
