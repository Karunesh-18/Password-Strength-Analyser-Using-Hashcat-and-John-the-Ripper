"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "analyze" },
  { href: "/generator", label: "generate" },
  { href: "/vault", label: "vault" },
  { href: "/history", label: "history" },
] as const;

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-4 text-sm">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={
            pathname === link.href
              ? "glow-text font-medium text-primary"
              : "text-muted-foreground hover:text-primary"
          }
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
