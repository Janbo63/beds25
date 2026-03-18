'use client';

import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function LoginContent() {
    const searchParams = useSearchParams();
    const error = searchParams.get('error');
    const from = searchParams.get('from') || '/dashboard';

    const handleGoogleLogin = () => {
        signIn('google', { callbackUrl: from });
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-stone-100 via-stone-50 to-amber-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-800 p-4">
            <div className="w-full max-w-sm">
                {/* Logo / Brand */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-600 to-amber-800 shadow-lg mb-4">
                        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-zinc-800 dark:text-zinc-100">
                        Beds25
                    </h1>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                        Staff Dashboard
                    </p>
                </div>

                {/* Login Card */}
                <div className="glass rounded-2xl p-8 shadow-xl">
                    {error && (
                        <div className="mb-6 p-3 rounded-xl bg-red-500/10 text-red-400 text-sm text-center flex items-center gap-2 justify-center animate-in fade-in zoom-in-95 duration-300">
                            <div className="w-2 h-2 rounded-full bg-red-500"></div>
                            {error === 'AccessDenied'
                                ? 'Access denied. Your email is not authorized.'
                                : 'Sign-in failed. Please try again.'}
                        </div>
                    )}

                    <button
                        onClick={handleGoogleLogin}
                        className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl font-semibold
                            bg-white dark:bg-zinc-800 border-2 border-zinc-200 dark:border-zinc-600
                            hover:border-amber-500 dark:hover:border-amber-400
                            text-zinc-800 dark:text-zinc-100
                            transition-all duration-200 hover:shadow-lg hover:shadow-amber-500/10
                            active:scale-[0.98]"
                    >
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                        </svg>
                        Sign in with Google
                    </button>

                    <p className="text-center text-xs text-zinc-400 dark:text-zinc-500 mt-6">
                        Authorized staff only
                    </p>
                </div>

                {/* Footer */}
                <p className="text-center text-xs text-zinc-400 dark:text-zinc-500 mt-6">
                    Zagroda Alpakoterapii • Admin Panel
                </p>
            </div>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-stone-100 via-stone-50 to-amber-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-800">
                <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            </div>
        }>
            <LoginContent />
        </Suspense>
    );
}
