import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '../utils/cn';

interface CustomSelectProps {
  label: string;
  value: string | string[];
  onChange: (value: string[]) => void;
  options: { value: string; label: string }[];
  theme: 'light' | 'dark';
  key?: string | number;
}

export function CustomSelect({ label, value, onChange, options, theme }: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Normalize value to string array
  const selectedValues: string[] = Array.isArray(value)
    ? value
    : (!value || value === 'ALL') ? ['ALL'] : [value];

  const isAllSelected = selectedValues.length === 0 || selectedValues.includes('ALL');

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleOptionClick = (optionValue: string) => {
    if (optionValue === 'ALL') {
      onChange(['ALL']);
      return;
    }

    if (isAllSelected) {
      // First specific selection replaces 'ALL'
      onChange([optionValue]);
    } else if (selectedValues.includes(optionValue)) {
      // Uncheck option
      const next = selectedValues.filter(v => v !== optionValue);
      if (next.length === 0) {
        onChange(['ALL']);
      } else {
        onChange(next);
      }
    } else {
      // Check additional option
      onChange([...selectedValues, optionValue]);
    }
  };

  // Header display text
  const getHeaderText = () => {
    if (isAllSelected) {
      const allOpt = options.find(o => o.value === 'ALL');
      return allOpt ? allOpt.label : 'TODOS';
    }

    if (selectedValues.length === 1) {
      const opt = options.find(o => o.value === selectedValues[0]);
      return opt ? opt.label : selectedValues[0];
    }

    const firstOpt = options.find(o => o.value === selectedValues[0]);
    const firstLabel = firstOpt ? firstOpt.label : selectedValues[0];
    return `${firstLabel} (+${selectedValues.length - 1})`;
  };

  const activeCount = isAllSelected ? 0 : selectedValues.length;

  return (
    <div className="flex flex-col gap-1.5" ref={containerRef}>
      <div className="flex items-center justify-between px-1">
        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
          {label}
        </span>
        {activeCount > 0 && (
          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-500 text-white">
            {activeCount}
          </span>
        )}
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "w-full px-3.5 py-2 rounded-xl text-[11px] font-semibold flex items-center justify-between transition-all duration-200 border",
            activeCount > 0
              ? (theme === 'dark'
                  ? "bg-indigo-900/30 border-indigo-500/50 text-indigo-200"
                  : "bg-indigo-50 border-indigo-300 text-indigo-900")
              : (theme === 'dark'
                  ? "bg-[#0d1117] border-white/10 text-[#e6edf3] hover:bg-white/[0.04]"
                  : "bg-white border-slate-200 text-slate-800 shadow-sm hover:bg-slate-50")
          )}
        >
          <span className="truncate mr-2 font-medium">{getHeaderText()}</span>
          <ChevronDown className={cn(
            "w-3.5 h-3.5 transition-transform duration-200 text-slate-400 shrink-0",
            isOpen && "rotate-180 text-indigo-400"
          )} />
        </button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className={cn(
                "absolute top-full left-0 right-0 mt-1.5 p-1.5 rounded-2xl border shadow-2xl z-[1000] origin-top max-h-72 overflow-y-auto custom-scrollbar",
                theme === 'dark' 
                  ? "bg-[#161b22] border-white/10 shadow-black/80" 
                  : "bg-white border-slate-200 shadow-2xl"
              )}
            >
              <div className="flex flex-col gap-0.5">
                {options.map((option) => {
                  const isSelected = option.value === 'ALL'
                    ? isAllSelected
                    : selectedValues.includes(option.value);

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleOptionClick(option.value)}
                      className={cn(
                        "w-full px-3 py-2 rounded-xl text-[10.5px] font-medium flex items-center justify-between transition-colors text-left",
                        isSelected
                          ? (theme === 'dark'
                              ? "bg-indigo-600/80 text-white font-semibold"
                              : "bg-indigo-50 text-indigo-900 font-semibold")
                          : (theme === 'dark'
                              ? "text-slate-300 hover:bg-white/[0.06]"
                              : "text-slate-700 hover:bg-slate-100")
                      )}
                    >
                      <span className="truncate flex-1 mr-2">{option.label}</span>
                      
                      {/* Checkbox indicator */}
                      <div className={cn(
                        "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                        isSelected
                          ? "bg-indigo-500 border-indigo-400 text-white"
                          : (theme === 'dark'
                              ? "border-white/20 bg-black/20"
                              : "border-slate-300 bg-white")
                      )}>
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
