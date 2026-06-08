"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className={`px-3 py-1.5 rounded-md text-sm transition ${
        active
          ? "text-gray-900 font-medium"
          : "text-gray-500 hover:text-gray-700"
      }`}
    >
      {label}
    </Link>
  );
}
