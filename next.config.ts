import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enables `use cache` + `cacheLife` function-level caching (Next 16 Cache
  // Components). The (app) layout reads cookies on every request, so all app
  // routes stay dynamic; PPR shells are therefore minimal.
  cacheComponents: true,
  // Allow LAN devices (phone/tablet) to open the dev server by IP.
  // DHCP reassigns addresses, so whitelist both known hosts of this network.
  allowedDevOrigins: ["192.168.1.2", "192.168.1.11"],
  experimental: {
    // Attachment uploads are posted through server actions; leave room for
    // multipart overhead above the 10 MB file cap.
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
