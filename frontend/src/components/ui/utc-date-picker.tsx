"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";

interface UTCDatePickerProps {
  value: string;            // "YYYY-MM-DD" UTC
  onChange: (date: string) => void;
  placeholder?: string;
  className?: string;
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS   = ["Su","Mo","Tu","We","Th","Fr","Sa"];

export function UTCDatePicker({ value, onChange, placeholder = "Date (UTC)", className = "" }: UTCDatePickerProps) {
  const todayUTC = new Date().toISOString().slice(0, 10);

  const initYear  = value ? parseInt(value.slice(0, 4))  : new Date().getUTCFullYear();
  const initMonth = value ? parseInt(value.slice(5, 7)) - 1 : new Date().getUTCMonth();

  const [open, setOpen]           = useState(false);
  const [viewYear, setViewYear]   = useState(initYear);
  const [viewMonth, setViewMonth] = useState(initMonth);
  const ref = useRef<HTMLDivElement>(null);

  // Sync calendar view when value changes externally (e.g. from URL param)
  useEffect(() => {
    if (value) {
      setViewYear(parseInt(value.slice(0, 4)));
      setViewMonth(parseInt(value.slice(5, 7)) - 1);
    }
  }, [value]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const daysInMonth = new Date(Date.UTC(viewYear, viewMonth + 1, 0)).getUTCDate();
  const firstDOW    = new Date(Date.UTC(viewYear, viewMonth, 1)).getUTCDay();

  const prevMonth = () => viewMonth === 0
    ? (setViewMonth(11), setViewYear(y => y - 1))
    : setViewMonth(m => m - 1);
  const nextMonth = () => viewMonth === 11
    ? (setViewMonth(0),  setViewYear(y => y + 1))
    : setViewMonth(m => m + 1);

  const select = (day: number) => {
    const d = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    onChange(d);
    setOpen(false);
  };

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-lg border bg-background text-left focus:outline-none focus:ring-1 focus:ring-primary/40 text-foreground/80 hover:border-primary/40 transition-colors"
      >
        <Calendar className="size-3 text-muted-foreground shrink-0" />
        {value
          ? <span>{value}</span>
          : <span className="text-muted-foreground/50">{placeholder}</span>}
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-card border border-border/60 rounded-xl shadow-xl p-3 min-w-[210px]">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <button onClick={prevMonth} className="p-1 rounded hover:bg-muted transition-colors">
              <ChevronLeft className="size-3" />
            </button>
            <span className="text-xs font-semibold">
              {MONTHS[viewMonth]} {viewYear}
              <span className="ml-1 text-[9px] font-normal text-muted-foreground">UTC</span>
            </span>
            <button onClick={nextMonth} className="p-1 rounded hover:bg-muted transition-colors">
              <ChevronRight className="size-3" />
            </button>
          </div>

          {/* Day labels */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS.map(d => (
              <div key={d} className="text-center text-[9px] text-muted-foreground font-semibold py-0.5">{d}</div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: firstDOW }).map((_, i) => <div key={`pad-${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day     = i + 1;
              const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const isToday    = dateStr === todayUTC;
              const isSelected = dateStr === value;
              return (
                <button
                  key={day}
                  onClick={() => select(day)}
                  className={`text-[11px] rounded py-1 transition-colors ${
                    isSelected
                      ? "bg-primary text-primary-foreground font-semibold"
                      : isToday
                      ? "bg-primary/15 text-primary font-semibold ring-1 ring-primary/30"
                      : "hover:bg-muted text-foreground/80"
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex gap-1.5 mt-2 pt-2 border-t">
            <button
              onClick={() => { onChange(todayUTC); setOpen(false); }}
              className="flex-1 text-[10px] py-1 rounded border hover:bg-muted transition-colors text-muted-foreground"
            >
              Today (UTC)
            </button>
            {value && (
              <button
                onClick={() => { onChange(""); setOpen(false); }}
                className="flex-1 text-[10px] py-1 rounded border hover:bg-muted transition-colors text-muted-foreground"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
