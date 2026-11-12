import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return { name: "Albion Transport", short_name: "Albion Transport", description: "Albion Online transport opportunity scanner.", start_url: "/black-market", display: "standalone", background_color: "#f8fafc", theme_color: "#047857", icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }] };
}
