'use client';

import React, { useState, useEffect, useRef } from 'react';

interface GuestSearchResult {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  lastStay?: string;
}

export interface GuestSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onGuestSelect: (guest: { id: string; name: string; email: string | null; phone: string | null }) => void;
  onNewGuest: () => void;
  className?: string;
  required?: boolean;
}

export default function GuestSearchInput({
  value,
  onChange,
  onGuestSelect,
  onNewGuest,
  className = '',
  required = false,
}: GuestSearchInputProps) {
  const [results, setResults] = useState<GuestSearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [linkedGuest, setLinkedGuest] = useState<{ id: string; name: string } | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounce search
  useEffect(() => {
    // If input is short, cleared, or we already have a linked guest, hide results
    if (!value || value.length < 2 || linkedGuest) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/admin/guests?q=${encodeURIComponent(value)}&limit=5`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.guests || data || []);
          setIsOpen(true);
          setSelectedIndex(-1);
        }
      } catch (err) {
        console.error('Failed to search guests', err);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [value, linkedGuest]);

  // Click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length)); // +1 for "Create new"
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex === results.length) {
        handleNewGuestClick();
      } else if (selectedIndex >= 0 && selectedIndex < results.length) {
        handleGuestSelect(results[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const handleGuestSelect = (guest: GuestSearchResult) => {
    setLinkedGuest({ id: guest.id, name: guest.name });
    onChange(guest.name);
    setIsOpen(false);
    onGuestSelect({
      id: guest.id,
      name: guest.name,
      email: guest.email,
      phone: guest.phone,
    });
  };

  const handleNewGuestClick = () => {
    setIsOpen(false);
    onNewGuest();
  };

  const handleUnlink = () => {
    setLinkedGuest(null);
    // Note: intentionally not clearing value here, so user can edit the name if they want
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      {linkedGuest && (
        <div className="mb-2 inline-flex items-center gap-2 rounded-md bg-green-50 dark:bg-green-900/20 px-2 py-1 text-sm text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800/30">
          <span>✓ Linked to: {linkedGuest.name}</span>
          <button
            type="button"
            onClick={handleUnlink}
            className="hover:text-green-900 dark:hover:text-green-200 p-0.5 rounded-full hover:bg-green-100 dark:hover:bg-green-800/50"
            title="Unlink guest"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      )}
      
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (value.length >= 2 && !linkedGuest) setIsOpen(true);
          }}
          className={`w-full bg-neutral-100 dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-800 rounded-xl p-3 outline-none focus:border-hotel-gold text-neutral-900 dark:text-white ${className}`}
          required={required}
          placeholder="Guest name..."
          disabled={!!linkedGuest}
        />
        
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <svg className="animate-spin h-5 w-5 text-neutral-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
        )}
      </div>

      {isOpen && (results.length > 0 || value.length >= 2) && !linkedGuest && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-xl overflow-hidden max-h-[280px] overflow-y-auto">
          {results.length > 0 ? (
            <ul className="py-1">
              {results.map((guest, index) => (
                <li
                  key={guest.id}
                  onClick={() => handleGuestSelect(guest)}
                  className={`px-4 py-3 cursor-pointer border-b border-neutral-100 dark:border-neutral-800/50 last:border-0 transition-colors ${
                    selectedIndex === index ? 'bg-neutral-100 dark:bg-neutral-800' : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
                  }`}
                >
                  <div className="font-bold text-neutral-900 dark:text-neutral-100">{guest.name}</div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                    {guest.email && <span>{guest.email}</span>}
                    {guest.phone && <span>{guest.phone}</span>}
                    {guest.lastStay && <span className="ml-auto opacity-75">Last stay: {guest.lastStay}</span>}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-4 py-4 text-sm text-neutral-500 dark:text-neutral-400 text-center">
              No matching guests found.
            </div>
          )}
          
          <div 
            className={`border-t border-neutral-200 dark:border-neutral-800 p-2 ${
              selectedIndex === results.length ? 'bg-neutral-100 dark:bg-neutral-800' : ''
            }`}
          >
            <button
              type="button"
              onClick={handleNewGuestClick}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-hotel-gold bg-transparent hover:bg-neutral-50 dark:hover:bg-neutral-800/50 rounded-lg transition-colors"
            >
              <span>➕</span> Create new guest
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
