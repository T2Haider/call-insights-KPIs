"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

interface CopyButtonProps {
  value: string;
  /** What is being copied, for the accessible name: "Copy conversation ID". */
  label: string;
  /** When set, shows a labelled button ("Copy link") instead of a small icon button. */
  text?: string;
}

export function CopyButton({ value, label, text }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy(event: React.MouseEvent) {
    event.stopPropagation(); // rows may be clickable
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked (permissions, insecure context); the value stays selectable.
    }
  }

  const icon = copied ? <Check aria-hidden className="text-emerald-600" /> : <Copy aria-hidden />;
  const accessibleName = copied ? "Copied" : `Copy ${label}`;

  if (text) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={copy} aria-label={accessibleName}>
        {icon}
        {copied ? "Copied" : text}
      </Button>
    );
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      onClick={copy}
      aria-label={accessibleName}
      title={accessibleName}
    >
      {icon}
    </Button>
  );
}
