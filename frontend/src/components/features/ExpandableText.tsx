"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface ExpandableTextProps {
  text: string;
  className?: string;
  previewLines?: number;
}

export function ExpandableText({ text, className = "", previewLines = 4 }: ExpandableTextProps) {
  const [expanded, setExpanded] = useState(false);

  const lineClamp = `line-clamp-${previewLines}`;

  return (
    <div>
      <p className={`${expanded ? "" : lineClamp} ${className}`}>{text}</p>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="mt-1.5 flex items-center gap-1 text-xs text-primary/70 hover:text-primary transition-colors"
      >
        {expanded ? (
          <><ChevronUp className="size-3" /> Show less</>
        ) : (
          <><ChevronDown className="size-3" /> Show more</>
        )}
      </button>
    </div>
  );
}
