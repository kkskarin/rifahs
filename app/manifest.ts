import type { MetadataRoute } from "next";

// Makes "Add to Home Screen" install Kaleidoscope Core like an app, with the round logo.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kaleidoscope · Core",
    short_name: "Core",
    description: "Orders, inventory and money for Kaleidoscope by Rifah.",
    start_url: "/",
    display: "standalone",
    background_color: "#F4EAC4",
    theme_color: "#F4EAC4",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
