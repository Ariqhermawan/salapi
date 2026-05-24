import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Salapi, crypto-invisible fintech",
    short_name: "Salapi",
    description:
      "GCash-funded savings, paluwagan, disaster relief & P2P on Stellar. Crypto invisible.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b1020",
    theme_color: "#1d4ed8",
    categories: ["finance"],
    icons: [
      // PNG raster icons first — most Android launchers prefer these over
      // SVG when installing a PWA to the home screen. Without these the
      // installed icon falls back to a generic "S" placeholder generated
      // from the manifest's short_name. Sourced from Salapi-Logo-Kit/
      // (the canonical Sampan mark on the indigo gradient tile).
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-1024.png", sizes: "1024x1024", type: "image/png", purpose: "any" },
      // Maskable variants — the same bitmap, declared maskable so
      // Android can crop the safe zone instead of stamping its own
      // background behind a transparent SVG.
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      // SVG fallback for browsers that prefer it (e.g. desktop install).
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
