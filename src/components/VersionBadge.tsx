'use client';

import { APP_VERSION } from '@/lib/version';

export default function VersionBadge() {
    return (
        <span className="text-[10px] font-mono font-bold text-hotel-gold px-2.5 py-0.5 rounded-full bg-hotel-gold/10 border border-hotel-gold/30">
            {APP_VERSION}
        </span>
    );
}
