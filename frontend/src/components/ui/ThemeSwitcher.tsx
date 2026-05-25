import React from 'react';
import { Sun, Moon, Zap, Terminal, Box, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

export type ThemeType = 'glass' | 'light' | 'cyber' | 'industrial' | 'aurora';

interface ThemeSwitcherProps {
  currentTheme: ThemeType;
  onThemeChange: (theme: ThemeType) => void;
  className?: string;
}

export const ThemeSwitcher: React.FC<ThemeSwitcherProps> = ({ currentTheme, onThemeChange, className }) => {
  const themes: { id: ThemeType; icon: LucideIcon; label: string; color: string }[] = [
    { id: 'glass', icon: Moon, label: '系统玻璃', color: 'bg-slate-800' },
    { id: 'light', icon: Sun, label: '清新浅色', color: 'bg-amber-100' },
    { id: 'cyber', icon: Zap, label: '赛博绿能', color: 'bg-emerald-950' },
    { id: 'industrial', icon: Box, label: '复古工业', color: 'bg-stone-500' },
    { id: 'aurora', icon: Sparkles, label: '极简极光', color: 'bg-indigo-500' }
  ];

  return (
    <div className={cn("flex items-center gap-1.5 rounded-full border border-white/10 bg-black/20 p-1 backdrop-blur-xl transition-all", className)}>
      {themes.map((theme) => {
        const Icon = theme.icon;
        const isActive = currentTheme === theme.id;
        
        return (
          <button
            key={theme.id}
            onClick={() => onThemeChange(theme.id)}
            title={theme.label}
            className={cn(
              "cursor-pointer group relative flex h-9 w-9 items-center justify-center rounded-full transition-all duration-300",
              isActive ? "bg-white/10 ring-1 ring-white/20" : "hover:bg-white/5"
            )}
          >
            {isActive && (
              <motion.div
                layoutId="active-theme-bg"
                className="absolute inset-0 rounded-full bg-teal-500/20 shadow-[0_0_15px_rgba(45,212,191,0.2)]"
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
            <Icon 
              size={16} 
              className={cn(
                "relative z-10 transition-colors duration-300", 
                isActive ? "text-teal-400" : "text-slate-500 group-hover:text-slate-100"
              )} 
            />
          </button>
        );
      })}
      
      <div className="mx-1 h-4 w-[1px] bg-white/10" />
      
      <div className="px-2 pr-3">
         <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5 grayscale opacity-60">
           <Terminal size={10} />
           {themes.find(t => t.id === currentTheme)?.label}
         </span>
      </div>
    </div>
  );
};
