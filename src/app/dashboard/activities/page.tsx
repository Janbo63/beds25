import React from 'react';
import type { Metadata } from 'next';
import ActivityDiary from '@/components/activities/ActivityDiary';

export const metadata: Metadata = {
  title: 'Dziennik Aktywności z Alpakami | Beds25 Console',
  description: 'Zeszyt spotkań i spacerów z alpakami',
};

export default function DashboardActivitiesPage() {
  return (
    <div className="p-4 sm:p-8 animate-in fade-in duration-500">
      <ActivityDiary />
    </div>
  );
}
