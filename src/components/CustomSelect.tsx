import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '../utils/cn';

interface CustomSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  theme: 'light' | 'dark';
  key?: string | number;
}

export function CustomSelect({ label, value, onChange, options, theme }: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(opt => opt.value === value) || options[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="flex flex-col gap-1.5" ref={containerRef}>
      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest pl-1">
        {label}
      </span>
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "w-full px-4 py-2.5 rounded-xl text-[11px] font-bold flex items-center justify-between transition-all duration-300 border",
            theme === 'dark'
              ? "bg-slate-900/90 border-white/10 text-white hover:bg-slate-800 focus:ring-1 focus:ring-indigo-500/50"
              : "bg-white border-slate-200 text-slate-900 shadow-sm hover:bg-slate-50 focus:ring-1 focus:ring-indigo-500/50"
          )}
        >
          <span className="truncate mr-2">{selectedOption?.label}</span>
          <ChevronDown className={cn(
            "w-3.5 h-3.5 transition-transform duration-300 text-slate-500",
            isOpen && "rotate-180 text-indigo-500"
          )} />
        </button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className={cn(
                "absolute top-full left-0 right-0 mt-2 p-1.5 rounded-2xl border shadow-2xl z-[1000] origin-top max-h-72 overflow-y-auto custom-scrollbar transition-all duration-200",
                theme === 'dark' 
                  ? "bg-slate-900 border-white/10" 
                  : "bg-white border-slate-200 shadow-xl"
              )}
            >
              <div className="flex flex-col gap-0.5">
                {options.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                    }}
                    className={cn(
                      "w-full px-3 py-2.5 rounded-xl text-[10px] font-bold flex items-center justify-between transition-colors mb-0.5 last:mb-0",
                      value === option.value
                        ? "bg-indigo-600 text-white"
                        : theme === 'dark'
                          ? "text-slate-300 hover:bg-white/5"
                          : "text-slate-700 hover:bg-slate-100"
                    )}
                  >
                    <span className="truncate">{option.label}</span>
                    {value === option.value && <Check className="w-3.5 h-3.5 shrink-0" />}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
