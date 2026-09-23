import React from "react";
import { clsx } from "clsx";

export const BrandLogo = ({ className = "w-10 h-10" }: { className?: string }) => (
  <div className={clsx("relative flex items-center justify-center bg-primary rounded-xl shadow-sm overflow-hidden shrink-0", className)}>
    {/* Subtle gradient overlay for premium feel */}
    <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent"></div>
    
    {/* Custom premium spine & wellness vector */}
    <svg 
      viewBox="0 0 24 24" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg" 
      className="w-3/5 h-3/5 text-white relative z-10"
    >
      <path 
        d="M12 3C12 3 7 8 7 14C7 16.7614 9.23858 19 12 19C14.7614 19 17 16.7614 17 14C17 8 12 3 12 3Z" 
        className="fill-white/20"
      />
      <path 
        d="M12 6V16M9.5 9.5H14.5M10 13H14" 
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      />
    </svg>
  </div>
);
