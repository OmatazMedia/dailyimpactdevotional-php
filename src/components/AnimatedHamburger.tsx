import React from "react";

interface AnimatedHamburgerProps {
  open: boolean;
  onClick: () => void;
  /** Extra classes for the button (colors, borders, padding…). */
  className?: string;
  ariaLabel?: string;
}

/**
 * Animated hamburger icon: three lines that smoothly morph into an "X" when
 * opened, and back into lines when closed. Used by the public Navbar and the
 * admin Dashboard mobile menus.
 */
export default function AnimatedHamburger({
  open,
  onClick,
  className = "",
  ariaLabel = "Toggle menu",
}: AnimatedHamburgerProps) {
  const bar =
    "absolute left-0 w-full h-[2px] rounded-full bg-current transition-all duration-300 ease-out";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-expanded={open}
      className={`relative flex items-center justify-center ${className}`}
    >
      <span aria-hidden="true" className="relative block w-6 h-6">
        <span className={`${bar} ${open ? "top-[11px] rotate-45" : "top-[7px]"}`} />
        <span className={`${bar} ${open ? "top-[11px] opacity-0" : "top-[13px]"}`} />
        <span className={`${bar} ${open ? "top-[11px] -rotate-45" : "top-[19px]"}`} />
      </span>
    </button>
  );
}
