import type { NextConfig } from "next";

// Sent with every page. HSTS tells browsers to use HTTPS only for a year
// (ignored on http://localhost); the others block clickjacking, MIME
// sniffing and referrer leaks. The camera stays allowed for face clock-in.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
];

// The addresses the pages had before they were renamed. Bookmarks and old
// links keep working: each one leads to the page's new address.
export const OLD_ADDRESSES: [string, string][] = [
  ["/basic-tables", "/employees"],
  ["/addEmployeeForm", "/employees/new"],
  ["/add-employee", "/employees/new"],
  ["/calendar/DoPlanning", "/planning/new"],
  ["/calendar/ViewPlanning", "/planning/view"],
  ["/calendar/ShiftsManagment", "/planning/shifts"],
  ["/clockinpage", "/clock-in"],
  ["/clockinfacerecognitionpage", "/clock-in/face"],
  ["/clockinpagehistory", "/clock-in/history"],
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async redirects() {
    return OLD_ADDRESSES.map(([source, destination]) => ({ source, destination, permanent: true }));
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/,
      use: ["@svgr/webpack"],
    });
    return config;
  },
    
    turbopack: {
      rules: {
        '*.svg': {
          loaders: ['@svgr/webpack'],
          as: '*.js',
        },
      },
    },
  
};

export default nextConfig;
