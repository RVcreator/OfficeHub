import React from 'react';

interface UserAvatarProps {
  name?: string;
  avatar?: string | null;
  className?: string;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  name = 'User',
  avatar,
  className = 'w-8 h-8',
}) => {
  const getBgColor = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colors = [
      'bg-blue-600 text-white',
      'bg-emerald-600 text-white',
      'bg-purple-600 text-white',
      'bg-amber-600 text-white',
      'bg-rose-600 text-white',
      'bg-indigo-600 text-white',
      'bg-teal-600 text-white',
      'bg-cyan-600 text-white',
    ];
    return colors[Math.abs(hash) % colors.length];
  };

  const initial = name && name.trim().length > 0 ? name.trim().charAt(0).toUpperCase() : 'U';
  const bgColor = getBgColor(name);

  if (avatar && avatar.trim() !== '') {
    return (
      <img
        src={avatar}
        alt={name}
        className={`${className} rounded-full object-cover shrink-0`}
        onError={(e) => {
          (e.currentTarget as HTMLElement).style.display = 'none';
        }}
      />
    );
  }

  return (
    <div
      className={`${className} rounded-full ${bgColor} flex items-center justify-center font-bold font-sans select-none shrink-0 text-xs`}
    >
      {initial}
    </div>
  );
};
