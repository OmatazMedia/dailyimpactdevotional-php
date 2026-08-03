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
    <div
      id="hero-banner"
      className="relative w-full aspect-[16/9] sm:aspect-[21/9] md:aspect-[24/9] lg:aspect-[28/9] min-h-[200px] max-h-[220px] sm:max-h-[340px] md:max-h-[420px] lg:max-h-[520px] overflow-hidden flex items-center justify-center bg-slate-950"
    >
      {/* Background Image: Authentic Daily Impact Devotional Banner */}
      <div className="absolute inset-0 z-0">
        <img
          src={activeBannerUrl}
          alt="Daily Impact Devotional Banner"
          className="w-full h-full object-contain object-center transition-all duration-300"
          referrerPolicy="no-referrer"
        />
        {/* Subtle warm ambient overlay for dark mode readability */}
        {isDarkMode && (
          <div className="absolute inset-0 bg-slate-950/25 mix-blend-multiply transition-colors duration-300" />
        )}
      </div>

      {/* Dynamic Content overlays are removed to allow the banner artwork to be completely clean */}
    </div>
  );
}
