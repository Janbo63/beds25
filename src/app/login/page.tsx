'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * PIN Login Page
 * 
 * Clean, hotel-themed login with 6-digit PIN entry.
 * Designed to work well on iPad and mobile.
 */
export default function LoginPage() {
    const [pin, setPin] = useState(['', '', '', '', '', '']);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
    const router = useRouter();

    // Focus first input on mount
    useEffect(() => {
        inputRefs.current[0]?.focus();
    }, []);

    const handleChange = (index: number, value: string) => {
        // Only allow digits
        if (value && !/^\d$/.test(value)) return;

        const newPin = [...pin];
        newPin[index] = value;
        setPin(newPin);
        setError('');

        // Auto-focus next input
        if (value && index < 5) {
            inputRefs.current[index + 1]?.focus();
        }

        // Auto-submit when all 6 digits entered
        if (value && index === 5 && newPin.every(d => d !== '')) {
            handleSubmit(newPin.join(''));
        }
    };

    const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
        // Backspace: clear current and move to previous
        if (e.key === 'Backspace' && !pin[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
            const newPin = [...pin];
            newPin[index - 1] = '';
            setPin(newPin);
        }
        // Enter: submit if complete
        if (e.key === 'Enter') {
            const fullPin = pin.join('');
            if (fullPin.length === 6) handleSubmit(fullPin);
        }
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        if (pasted.length === 6) {
            const newPin = pasted.split('');
            setPin(newPin);
            inputRefs.current[5]?.focus();
            handleSubmit(pasted);
        }
    };

    const handleSubmit = async (pinCode: string) => {
        setLoading(true);
        setError('');

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin: pinCode }),
            });

            if (res.ok) {
                router.push('/dashboard');
                router.refresh();
            } else {
                setError('Invalid PIN');
                setPin(['', '', '', '', '', '']);
                inputRefs.current[0]?.focus();
            }
        } catch {
            setError('Connection error. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-stone-100 via-stone-50 to-amber-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-800 p-4">
            <div className="w-full max-w-sm">
                {/* Logo / Brand */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-600 to-amber-800 shadow-lg mb-4">
                        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-zinc-800 dark:text-zinc-100">
                        Admin Access
                    </h1>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                        Enter your 6-digit PIN
                    </p>
                </div>

                {/* PIN Input */}
                <div className="glass rounded-2xl p-6 shadow-xl">
                    <div className="flex justify-center gap-3 mb-6" onPaste={handlePaste}>
                        {pin.map((digit, i) => (
                            <input
                                key={i}
                                ref={el => { inputRefs.current[i] = el; }}
                                type="text"
                                inputMode="numeric"
                                maxLength={1}
                                value={digit}
                                onChange={e => handleChange(i, e.target.value)}
                                onKeyDown={e => handleKeyDown(i, e)}
                                className={`
                                    w-12 h-14 text-center text-xl font-bold rounded-xl border-2 
                                    transition-all duration-200 outline-none
                                    bg-white dark:bg-zinc-800
                                    ${error
                                        ? 'border-red-400 dark:border-red-500'
                                        : 'border-zinc-200 dark:border-zinc-600 focus:border-amber-500 dark:focus:border-amber-400'
                                    }
                                    text-zinc-800 dark:text-zinc-100
                                    focus:ring-2 focus:ring-amber-500/20
                                `}
                                disabled={loading}
                                autoComplete="off"
                            />
                        ))}
                    </div>

                    {/* Error message */}
                    {error && (
                        <p className="text-center text-sm text-red-500 dark:text-red-400 mb-4 animate-pulse">
                            {error}
                        </p>
                    )}

                    {/* Loading indicator */}
                    {loading && (
                        <div className="flex justify-center mb-4">
                            <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                    )}

                    <p className="text-center text-xs text-zinc-400 dark:text-zinc-500">
                        PIN auto-submits when complete
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
