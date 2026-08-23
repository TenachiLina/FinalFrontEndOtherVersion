"use client";

import React from "react";

interface TooltipProps {
  text: string;
  children: React.ReactNode;
}

export default function Tooltip({
  text,
  children,
}: TooltipProps) {
  return (
    <div className="relative group inline-flex">
      {children}

      <div
        className="
          absolute
          left-full
          top-1/2
          -translate-y-1/2
          ml-2
          z-50
          hidden
          group-hover:block
          w-max
          max-w-xs
          rounded-md
          bg-gray-900
          px-3
          py-2
          text-xs
          text-white
          shadow-lg
          whitespace-normal
        "
      >
        {text}
      </div>
    </div>
  );
}