import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow LAN devices (phone/tablet) to open the dev server by IP.
  allowedDevOrigins: ["192.168.1.11"],
  experimental: {
    // Attachment uploads are posted through server actions; leave room for
    // multipart overhead above the 10 MB file cap.
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
