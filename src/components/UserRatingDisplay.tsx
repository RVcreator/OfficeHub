import React from 'react';
import { Star } from 'lucide-react';
import { usePortalStore } from '../services/store';
import { getUserRatingSummary } from '../utils/staffRatings';

interface UserRatingDisplayProps {
  userId?: string;
  averageRating?: number;
  totalRatingsCount?: number;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
  showZeroState?: boolean;
  onClick?: () => void;
}

export const UserRatingDisplay: React.FC<UserRatingDisplayProps> = ({
  userId,
  averageRating: propAverage,
  totalRatingsCount: propCount,
  size = 'xs',
  className = '',
  showZeroState = false,
  onClick,
}) => {
  const { tasks, staff } = usePortalStore();

  let avg = propAverage ?? 0;
  let count = propCount ?? 0;

  if (userId) {
    const summary = getUserRatingSummary(userId, tasks, staff);
    avg = summary.averageRating;
    count = summary.totalRatingsCount;
  }

  if (count === 0 && !showZeroState) {
    return (
      <span className={`inline-flex items-center gap-1 text-slate-400 font-normal ${size === 'xs' ? 'text-[10px]' : 'text-xs'} ${className}`}>
        <Star className={`${size === 'xs' ? 'w-2.5 h-2.5' : 'w-3 h-3'} text-slate-300 stroke-[1.5]`} />
        <span>No ratings yet</span>
      </span>
    );
  }

  const roundedStars = Math.round(avg);
  const iconSize = size === 'xs' ? 'w-2.5 h-2.5' : size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';
  const textSize = size === 'xs' ? 'text-[10px]' : size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <div
      onClick={onClick}
      className={`inline-flex items-center gap-1 select-none ${onClick ? 'cursor-pointer hover:opacity-80' : ''} ${className}`}
      title={`Staff Task Completion Rating: ${avg > 0 ? avg.toFixed(1) : 'No'} / 5.0 (${count} ${count === 1 ? 'rating' : 'ratings'})`}
    >
      {/* 5-star row matching text height */}
      <span className="inline-flex items-center gap-0.5 text-amber-400">
        {[1, 2, 3, 4, 5].map((starIdx) => {
          const isFilled = starIdx <= roundedStars;
          return isFilled ? (
            <Star
              key={starIdx}
              className={`${iconSize} fill-amber-400 text-amber-400 stroke-[1.5] shrink-0`}
            />
          ) : (
            <Star
              key={starIdx}
              className={`${iconSize} text-slate-300 stroke-[1.5] shrink-0`}
            />
          );
        })}
      </span>

      {/* Numeric average and count in small grey text */}
      <span className={`font-semibold text-slate-700 ${textSize}`}>
        {avg.toFixed(1)}
      </span>
      <span className={`text-slate-400 font-normal ${textSize}`}>
        ({count})
      </span>
    </div>
  );
};
