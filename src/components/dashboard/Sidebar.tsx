'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    Calendar,
    BarChart3,
    Settings,
    Banknote,
    ChevronRight,
    LayoutDashboard
} from 'lucide-react';

const SidebarItem = ({ icon: Icon, label, href, active }: { icon: any, label: string, href: string, active: boolean }) => (
    <Link
        href={href}
        className={`group flex items-center justify-between px-4 py-3.5 rounded-2xl transition-all duration-300 ${active
            ? 'bg-hotel-gold text-black shadow-lg shadow-hotel-gold/20 scale-[1.02]'
            : 'text-neutral-400 hover:text-white hover:bg-white/5'
            }`}
    >
        <div className="flex items-center gap-3">
            <Icon size={20} strokeWidth={active ? 2.5 : 2} />
            <span className={`text-sm font-bold tracking-tight ${active ? 'opacity-100' : 'opacity-80'}`}>
                {label}
            </span>
        </div>
        {active && <ChevronRight size={16} className="animate-in fade-in slide-in-from-left-2" />}
    </Link>
);

export default function Sidebar() {
    const pathname = usePathname();
    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => {
        setMounted(true);
    }, []);

    const menuItems = [
        { icon: Calendar, label: 'Tape Chart & Rates', href: '/dashboard' },
        { icon: BarChart3, label: 'Financial Reports', href: '/dashboard/reports' },
        { icon: Settings, label: 'Management', href: '/dashboard/settings' },
    ];

    if (!mounted) return (
        <aside className="w-72 h-screen sticky top-0 bg-neutral-900 border-r border-white/5 flex flex-col p-6 z-[100]" />
    );

    return (
        <aside className="w-72 h-screen sticky top-0 bg-neutral-900/50 border-r border-white/5 flex flex-col p-6 backdrop-blur-3xl z-[100]">
            <div className="mb-12 px-2">
                <div className="flex items-center gap-4 group">
                    <div className="w-12 h-12 bg-alpaca-green rounded-xl flex items-center justify-center text-2xl shadow-2xl border border-hotel-gold/30 group-hover:scale-110 transition-transform duration-500">
                        🦙
                    </div>
                    <div>
                        <h1 className="text-xl font-black tracking-tighter text-white">
                            Zagroda <span className="text-hotel-gold">Alpaka</span>
                        </h1>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 mt-0.5">Console v2.5</p>
                    </div>
                </div>
            </div>

            <nav className="flex-1 space-y-2">
                <div className="px-3 mb-4">
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-600">Primary Navigation</span>
                </div>
                {menuItems.map((item) => (
                    <SidebarItem
                        key={item.href}
                        icon={item.icon}
                        label={item.label}
                        href={item.href}
                        active={pathname === item.href}
                    />
                ))}
            </nav>

            <div className="mt-auto pt-6 border-t border-white/5">
                <div className="bg-gradient-to-br from-hotel-gold/10 to-transparent p-4 rounded-2xl border border-hotel-gold/10">
                    <div className="text-[10px] font-black uppercase tracking-[0.1em] text-hotel-gold mb-1">Status</div>
                    <div className="flex items-center gap-2 text-xs font-bold text-white">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        Channels Live
                    </div>
                </div>
            </div>
        </aside>
    );
}
