import React from "react";
import { API_BASE } from "../config/api";

interface HeroProps {
  isDarkMode: boolean;
  /** Preloaded homepage hero image URL (from settings) so the banner is correct on first paint. */
  heroImage?: string;
}

export default function Hero({ isDarkMode, heroImage }: HeroProps) {
  const defaultBannerUrl = "/assets/images/devotional-title-default.jpg";
  const [activeBannerUrl, setActiveBannerUrl] = React.useState(heroImage || defaultBannerUrl);

  React.useEffect(() => {
    // When the parent already preloaded the setting, use it directly — no
    // extra round-trip, so the correct banner never flashes the default first.
    if (heroImage) {
      setActiveBannerUrl(heroImage);
      return;
    }
    fetch(`${API_BASE}/settings.php`)
      .then((res) => res.ok ? res.json() : null)
      .then((data: { homepage_hero_image?: string } | null) => {
        const url = data?.homepage_hero_image || "";
        setActiveBannerUrl(url || defaultBannerUrl);
      })
      .catch(() => setActiveBannerUrl(defaultBannerUrl));
  }, [heroImage]);

  return (
    <div id="hero-banner" className="relative w-full bg-slate-950 leading-none">
      {/* Background Image: Authentic Daily Impact Devotional Banner.
          Displayed at its NATIVE size (e.g. 1920×300) so the full image is
          always visible edge-to-end — it scales down on smaller devices
          while preserving the entire image (no cropping). */}
      <img
        src={activeBannerUrl}
        alt="Daily Impact Devotional Banner"
        className="block w-full h-auto transition-all duration-300"
        referrerPolicy="no-referrer"
      />
      {/* Subtle warm ambient overlay for dark mode readability */}
      {isDarkMode && (
        <div className="absolute inset-0 bg-slate-950/25 mix-blend-multiply pointer-events-none transition-colors duration-300" />
      )}

      {/* Dynamic Content overlays are removed to allow the banner artwork to be completely clean */}
    </div>
  );
}
