import React, { useState } from 'react';
import { getCalendarOccasions, CalendarOccasionMarker } from '../utils/calendarOccasions';

interface CalendarOccasionDotsProps {
  dateStr: string;
  className?: string;
  size?: 'xs' | 'sm' | 'md';
  align?: 'left' | 'right' | 'center';
}

export const CalendarOccasionDots: React.FC<CalendarOccasionDotsProps> = ({
  dateStr,
  className = '',
  size = 'sm',
  align = 'right'
}) => {
  const markers = getCalendarOccasions(dateStr);
  const [activeTooltipId, setActiveTooltipId] = useState<string | null>(null);

  if (!markers || markers.length === 0) {
    return null;
  }

  return (
    <div 
      className={`inline-flex items-center gap-1.5 shrink-0 ${className}`}
      onClick={(e) => {
        // Prevent day cell click or quick-create when touching the markers area
        e.stopPropagation();
      }}
    >
      {markers.map((marker) => {
        const isTooltipActive = activeTooltipId === marker.id;
        const isKhushali = marker.category === 'shia_happy';
        const isWafaat = marker.category === 'shia_mourning';
        const isTzHoliday = marker.category === 'tanzania_holiday';
        const isUnDay = marker.category === 'un_designated_day';

        return (
          <div
            key={marker.id}
            className="relative group flex items-center justify-center"
            onMouseEnter={() => setActiveTooltipId(marker.id)}
            onMouseLeave={() => setActiveTooltipId(null)}
          >
            {/* The Marker Button / Badge */}
            {isTzHoliday ? (
              <button
                type="button"
                aria-label={marker.name}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setActiveTooltipId(prev => prev === marker.id ? null : marker.id);
                }}
                className="w-5 h-5 rounded-full inline-flex items-center justify-center shadow-sm hover:scale-110 transition-transform focus:outline-none border border-emerald-800 cursor-help shrink-0 overflow-hidden bg-white"
                title={marker.name}
              >
                <svg viewBox="0 0 900 600" className="w-full h-full object-cover">
                  <rect width="900" height="600" fill="#00a3dd" />
                  <polygon points="0,0 900,0 0,600" fill="#1eb53a" />
                  <polygon points="0,200 700,600 900,600 900,400 200,0 0,0" fill="#fcd116" />
                  <polygon points="0,240 640,600 900,600 900,360 260,0 0,0" fill="#000000" />
                </svg>
              </button>
            ) : isUnDay ? (
              <button
                type="button"
                aria-label={marker.name}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setActiveTooltipId(prev => prev === marker.id ? null : marker.id);
                }}
                className="w-4.5 h-4.5 rounded-full inline-flex items-center justify-center text-[10px] shadow-md bg-sky-600 hover:scale-110 transition-transform focus:outline-none border-2 border-white ring-2 ring-sky-500/50 cursor-help shrink-0 text-white"
                title={marker.name}
              >
                🌐
              </button>
            ) : (
              <button
                type="button"
                aria-label={marker.name}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setActiveTooltipId(prev => prev === marker.id ? null : marker.id);
                }}
                className={`w-3.5 h-3.5 rounded-full transition-transform hover:scale-125 focus:outline-none shadow-md cursor-help shrink-0 ${
                  isKhushali
                    ? 'bg-emerald-500 border-2 border-white ring-2 ring-emerald-500/50'
                    : 'bg-slate-900 border-2 border-slate-200 ring-2 ring-slate-900/50'
                }`}
                title={marker.name}
              />
            )}

            {/* Lightweight Hover / Tap Popover showing Event Name */}
            <div
              className={`absolute bottom-full mb-1.5 ${
                align === 'left' ? 'left-0' : align === 'center' ? 'left-1/2 -translate-x-1/2' : 'right-0'
              } z-40 px-2 py-1 bg-slate-900/95 text-white text-[10px] font-semibold rounded shadow-md border border-slate-700/80 whitespace-nowrap pointer-events-none transition-opacity duration-150 ${
                isTooltipActive ? 'opacity-100 scale-100' : 'opacity-0 scale-95 hidden group-hover:block group-hover:opacity-100 group-hover:scale-100'
              }`}
              style={{ maxWidth: '260px' }}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    isKhushali
                      ? 'bg-emerald-400'
                      : isWafaat
                      ? 'bg-slate-300'
                      : isUnDay
                      ? 'bg-sky-400'
                      : 'bg-blue-400'
                  }`}
                />
                <span className="truncate">
                  {isKhushali ? (
                    <span className="text-emerald-300 font-bold mr-1">Khushali:</span>
                  ) : isWafaat ? (
                    <span className="text-slate-300 font-bold mr-1">Wafaat:</span>
                  ) : isTzHoliday ? (
                    <span className="text-blue-300 font-bold mr-1">Tanzania Holiday:</span>
                  ) : isUnDay ? (
                    <span className="text-sky-300 font-bold mr-1">UN Day:</span>
                  ) : null}
                  {marker.name.replace(/^(Tanzania Holiday|UN Day):\s*/, '')}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
