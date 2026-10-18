"use client";

import GridShape from "@/components/common/GridShape";
import { displayBrand, useSignInBrand } from "@/lib/branding";

/** Right-hand panel of the sign-in page, in the company's colours. */
export default function AuthBrandPanel() {
  const { brand, ready } = useSignInBrand();
  const b = displayBrand(brand);

  return (
    <div
      className="lg:w-1/2 w-full h-full lg:grid items-center hidden transition-colors duration-300"
      style={{ backgroundColor: ready ? b.color : undefined }}
    >
      <div
        className={`relative items-center justify-center flex z-1 transition-opacity duration-300 ${
          ready ? "opacity-100" : "opacity-0"
        }`}
      >
        <GridShape />
        <div className="flex flex-col items-center max-w-sm px-6 text-center">
          {/* Plain <img>: logos are data URLs uploaded per company */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={b.logo}
            alt={`${b.name} logo`}
            className="mb-6 h-24 w-auto max-w-[220px] rounded-xl object-contain"
          />
          <h2 className="mb-2 text-2xl font-semibold text-white">{b.title}</h2>
          {b.subtitle && <p className="text-white/70">{b.subtitle}</p>}
        </div>
      </div>
    </div>
  );
}
