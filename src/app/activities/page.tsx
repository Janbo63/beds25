import React from 'react';
import type { Metadata } from 'next';
import ActivityDiary from '@/components/activities/ActivityDiary';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Zeszyt Alpak — Zagroda Alpakoterapii',
  description: 'Ewidencja spotkań i spacerów z alpakami dla Doroty',
};

export default function StandaloneActivitiesPage() {
  return (
    <div className="min-h-screen bg-neutral-100 dark:bg-neutral-950 text-neutral-900 dark:text-white">
      {/* Top minimal header */}
      <header className="px-4 py-3 bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between sticky top-0 z-50 backdrop-blur-md bg-white/90 dark:bg-neutral-900/90">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-alpaca-green text-white flex items-center justify-center text-lg shadow-sm">
            🦙
          </div>
          <div>
            <h1 className="text-base font-black leading-tight">
              Zagroda Alpakoterapii
            </h1>
            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
              Zeszyt Zapisów Doroty
            </p>
          </div>
        </div>

        <Link
          href="/dashboard"
          className="text-xs font-bold text-neutral-500 hover:text-neutral-900 dark:hover:text-white px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-800 transition-colors flex items-center gap-1.5"
        >
          <ArrowLeft size={13} />
          Panel Beds25
        </Link>
      </header>

      {/* Main Diary View */}
      <main className="py-4">
        <ActivityDiary />
      </main>
    </div>
  );
}
