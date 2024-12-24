"use client";

import { useState } from "react";
import {
  UserIcon,
  BellIcon,
  KeyIcon,
  CreditCardIcon,
  DocumentDuplicateIcon,
  GlobeAltIcon,
} from "@heroicons/react/24/outline";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("profile");

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        {/* Tabs Navigation */}
        <div className="border-b border-gray-200">
          <nav className="flex gap-6 px-6">
            <button
              onClick={() => setActiveTab("profile")}
              className={`py-4 px-2 border-b-2 font-medium text-sm ${
                activeTab === "profile"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Profile
            </button>
            <button
              onClick={() => setActiveTab("notifications")}
              className={`py-4 px-2 border-b-2 font-medium text-sm ${
                activeTab === "notifications"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Notifications
            </button>
            <button
              onClick={() => setActiveTab("billing")}
              className={`py-4 px-2 border-b-2 font-medium text-sm ${
                activeTab === "billing"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Billing
            </button>
            <button
              onClick={() => setActiveTab("security")}
              className={`py-4 px-2 border-b-2 font-medium text-sm ${
                activeTab === "security"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Security
            </button>
          </nav>
        </div>

        {/* Profile Settings */}
        {activeTab === "profile" && (
          <div className="p-6">
            <div className="max-w-xl">
              <div className="flex items-center gap-6 mb-8">
                <div className="w-20 h-20 bg-[#00BA88] rounded-full flex items-center justify-center text-white text-2xl font-medium">
                  D
                </div>
                <button className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Change Avatar
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Full Name
                  </label>
                  <input
                    type="text"
                    defaultValue="David Puertolas Merenciano"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    defaultValue="davidpuertolasmerenciano@gmail.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Timezone
                  </label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                    <option>Europe/Madrid</option>
                    <option>UTC</option>
                    <option>America/New_York</option>
                  </select>
                </div>

                <div className="pt-4">
                  <button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Notifications Settings */}
        {activeTab === "notifications" && (
          <div className="p-6">
            <div className="max-w-xl space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-900">Email Notifications</h3>
                  <p className="text-sm text-gray-500">Get notified when your videos are ready</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" defaultChecked />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-900">Marketing Emails</h3>
                  <p className="text-sm text-gray-500">Receive updates about new features</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Billing Settings */}
        {activeTab === "billing" && (
          <div className="p-6">
            <div className="max-w-xl">
              <div className="mb-6">
                <h3 className="font-medium text-gray-900 mb-2">Current Plan</h3>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium">Free Plan</p>
                      <p className="text-sm text-gray-500">Basic features included</p>
                    </div>
                    <button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                      Upgrade Plan
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-medium text-gray-900 mb-2">Payment Method</h3>
                <button className="w-full border border-gray-300 rounded-lg p-4 text-left hover:bg-gray-50">
                  <div className="flex items-center gap-4">
                    <CreditCardIcon className="w-6 h-6 text-gray-400" />
                    <span className="text-gray-700">Add payment method</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Security Settings */}
        {activeTab === "security" && (
          <div className="p-6">
            <div className="max-w-xl space-y-6">
              <div>
                <h3 className="font-medium text-gray-900 mb-4">Change Password</h3>
                <div className="space-y-4">
                  <input
                    type="password"
                    placeholder="Current Password"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                  <input
                    type="password"
                    placeholder="New Password"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                  <input
                    type="password"
                    placeholder="Confirm New Password"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                  <button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                    Update Password
                  </button>
                </div>
              </div>

              <div className="pt-4 border-t">
                <h3 className="font-medium text-gray-900 mb-4">Two-Factor Authentication</h3>
                <button className="w-full border border-gray-300 rounded-lg p-4 text-left hover:bg-gray-50">
                  <div className="flex items-center gap-4">
                    <KeyIcon className="w-6 h-6 text-gray-400" />
                    <div>
                      <p className="font-medium text-gray-900">Enable 2FA</p>
                      <p className="text-sm text-gray-500">Add an extra layer of security to your account</p>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
