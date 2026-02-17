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
    LayoutDashboard,
    ChevronLeft,
    Menu
} from 'lucide-react';

const SidebarItem = ({ icon: Icon, label, href, active, collapsed }: { icon: any, label: string, href: string, active: boolean, collapsed: boolean }) => (
    <Link
        href={href}
        className={`group flex items-center ${collapsed ? 'justify-center px-2' : 'justify-between px-4'} py-3.5 rounded-2xl transition-all duration-300 ${active
            ? 'bg-hotel-gold text-black shadow-lg shadow-hotel-gold/20 scale-[1.02]'
            : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/50 dark:hover:bg-white/5'
            }`}
        title={collapsed ? label : undefined}
    >
        <div className={`flex items-center ${collapsed ? 'gap-0' : 'gap-3'}`}>
            <Icon size={20} strokeWidth={active ? 2.5 : 2} />
            {!collapsed && (
                <span className={`text-sm font-bold tracking-tight ${active ? 'opacity-100' : 'opacity-80'}`}>
                    {label}
                </span>
            )}
        </div>
        {!collapsed && active && <ChevronRight size={16} className="animate-in fade-in slide-in-from-left-2" />}
    </Link>
);

export default function Sidebar() {
    const pathname = usePathname();
    const [mounted, setMounted] = React.useState(false);
    const [isCollapsed, setIsCollapsed] = React.useState(false);

    React.useEffect(() => {
        setMounted(true);
    }, []);

    const menuItems = [
        { icon: Calendar, label: 'Tape Chart & Rates', href: '/dashboard' },
        { icon: BarChart3, label: 'Financial Reports', href: '/dashboard/reports' },
        { icon: Settings, label: 'Management', href: '/dashboard/settings' },
    ];

    if (!mounted) return (
        <aside className="w-72 h-screen sticky top-0 bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-white/5 flex flex-col p-6 z-[100]" />
    );

    return (
        <aside className={`${isCollapsed ? 'w-20 px-3' : 'w-72 p-6'} h-screen sticky top-0 bg-white/95 dark:bg-neutral-900/95 border-r border-neutral-200 dark:border-white/5 flex flex-col transition-all duration-300 ease-in-out backdrop-blur-3xl z-[100]`}>
            <div className={`mb-8 ${isCollapsed ? 'mt-4 flex flex-col items-center gap-4' : 'flex items-center justify-between gap-4'}`}>
                <div className={`flex items-center gap-4 group ${isCollapsed ? 'justify-center' : ''}`}>
                    <div className="w-10 h-10 bg-alpaca-green rounded-xl flex items-center justify-center text-xl shadow-2xl border border-hotel-gold/30 group-hover:scale-110 transition-transform duration-500 cursor-pointer" onClick={() => setIsCollapsed(!isCollapsed)}>
                        🦙
                    </div>
                    {!isCollapsed && (
                        <div className="animate-in fade-in slide-in-from-left-4 duration-300">
                            <h1 className="text-lg font-black tracking-tighter text-neutral-800 dark:text-white whitespace-nowrap">
                                Zagroda <span className="text-hotel-gold">Alpaka</span>
                            </h1>
                            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-400 dark:text-neutral-500 mt-0.5">Console v2.6</p>
                        </div>
                    )}
                </div>

                {!isCollapsed && (
                    <button
                        onClick={() => setIsCollapsed(true)}
                        className="p-1.5 hover:bg-neutral-200 dark:hover:bg-white/10 rounded-lg text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-white transition-colors"
                    >
                        <ChevronLeft size={16} />
                    </button>
                )}
            </div>

            <nav className="flex-1 space-y-2">
                {!isCollapsed && (
                    <div className="px-3 mb-2 animate-in fade-in duration-300">
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-400 dark:text-neutral-600">Navigation</span>
                    </div>
                )}
                {menuItems.map((item) => (
                    <SidebarItem
                        key={item.href}
                        icon={item.icon}
                        label={item.label}
                        href={item.href}
                        active={pathname === item.href}
                        collapsed={isCollapsed}
                    />
                ))}
            </nav>

            <div className={`mt-auto pt-6 border-t border-neutral-200 dark:border-white/5 ${isCollapsed ? 'flex justify-center' : ''}`}>
                {!isCollapsed ? (
                    <div className="bg-gradient-to-br from-hotel-gold/10 to-transparent p-4 rounded-2xl border border-hotel-gold/10 animate-in fade-in duration-500">
                        <div className="text-[10px] font-black uppercase tracking-[0.1em] text-hotel-gold mb-1">Status</div>
                        <div className="flex items-center gap-2 text-xs font-bold text-neutral-700 dark:text-white">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            Channels Live
                        </div>
                    </div>
                ) : (
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse mb-4" title="System Online"></div>
                )}
            </div>

            {isCollapsed && (
                <button
                    onClick={() => setIsCollapsed(false)}
                    className="absolute bottom-4 right-[-12px] bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-full p-1 text-neutral-700 dark:text-white shadow-lg hover:scale-110 transition-transform"
                >
                    <ChevronRight size={12} />
                </button>
            )}
        </aside>
    );
}
