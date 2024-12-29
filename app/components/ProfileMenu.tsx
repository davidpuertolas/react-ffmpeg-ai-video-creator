"use client";

import { Fragment } from 'react';
import { Menu, Transition } from '@headlessui/react';
import { UserCircleIcon } from '@heroicons/react/24/outline';

export default function ProfileMenu() {
  return (
    <Menu as="div" className="relative">
      <Menu.Button className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-50 transition-colors">
        <UserCircleIcon className="w-6 h-6 text-gray-600" />
      </Menu.Button>
      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <Menu.Items className="absolute right-0 mt-2 w-48 origin-top-right rounded-xl bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none p-1">
          <Menu.Item>
            {({ active }) => (
              <button
                className={`${
                  active ? 'bg-gray-50' : ''
                } group flex w-full items-center rounded-lg px-4 py-2 text-sm text-gray-700`}
              >
                Profile Settings
              </button>
            )}
          </Menu.Item>
          <Menu.Item>
            {({ active }) => (
              <button
                className={`${
                  active ? 'bg-gray-50' : ''
                } group flex w-full items-center rounded-lg px-4 py-2 text-sm text-gray-700`}
              >
                Sign Out
              </button>
            )}
          </Menu.Item>
        </Menu.Items>
      </Transition>
    </Menu>
  );
}
