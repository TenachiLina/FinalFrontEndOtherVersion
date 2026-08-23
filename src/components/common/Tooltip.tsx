"use client";

import React, { useState, useRef } from "react";

interface TooltipProps {
  text: string;
  children: React.ReactNode;
}

export default function Tooltip({
  text,
  children,
}: TooltipProps) {
  const [show, setShow] = useState(false);

  const [position, setPosition] = useState({
    top: 0,
    left: 0,
  });

  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();

    const tooltipWidth = 280;
    const gap = 8;

    // Center tooltip above the component
    let left =
      rect.left +
      rect.width / 2 -
      tooltipWidth / 2;

    // Prevent going outside the left edge
    if (left < 10) {
      left = 10;
    }

    // Prevent going outside the right edge
    if (left + tooltipWidth > window.innerWidth - 10) {
      left =
        window.innerWidth -
        tooltipWidth -
        10;
    }

    const top = rect.top - gap;

    setPosition({
      top,
      left,
    });

    setShow(true);
  };

  return (
    <div
      ref={containerRef}
      className="relative group w-full"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setShow(false)}
    >
      {children}

      {show && (
        <div
          className="
            fixed
            z-[9999]
            w-[280px]
            -translate-y-full
            rounded-md

            bg-gray-900
            dark:bg-white

            px-3
            py-2

            text-center
            text-xs

            text-white
            dark:text-gray-800

            shadow-lg
            dark:shadow-gray-900/30

            whitespace-normal
            pointer-events-none

            border
            border-gray-800
            dark:border-gray-200
          "
          style={{
            top: position.top,
            left: position.left,
          }}
        >
          {text}
        </div>
      )}
    </div>
  );
}