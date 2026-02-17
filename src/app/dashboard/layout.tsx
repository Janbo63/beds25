import Sidebar from '@/components/dashboard/Sidebar';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex min-h-screen bg-neutral-100 dark:bg-neutral-950 transition-colors">
            <Sidebar />
            <div className="flex-1 max-h-screen overflow-y-auto custom-scrollbar">
                {children}
            </div>
        </div>
    );
}
