import React, { useEffect, useState } from "react";
import { API_BASE } from "../config/api";
import { Facebook, Twitter, Instagram, Youtube, Mail, Phone, ArrowUp, Heart, Play } from "lucide-react";
import InstallGuideModal from "./InstallGuideModal";
import { getPwaState, initPwa, promptInstall, subscribePwa } from "../lib/pwa";

interface FooterProps {
  isDarkMode: boolean;
  onNavigateAuthor?: () => void;
  onOpenDonate?: () => void;
}

const BIBLE_KEYS = [
  { code: "NKJV", name: "New King James Version" },
  { code: "AMP",  name: "The Amplified Bible" },
  { code: "TLB",  name: "The Living Bible" },
  { code: "ISV",  name: "International Standard Version" },
  { code: "NIV",  name: "New International Version" },
  { code: "MSG",  name: "The Message Translation" },
  { code: "WEB",  name: "The World English Bible" },
  { code: "TNLT", name: "The New Living Translation" },
  { code: "TEV",  name: "Today's English Version" },
  { code: "RSV",  name: "Revised Standard Version" },
  { code: "GNB",  name: "Good News Bible" },
  { code: "WNT",  name: "Weymouth New Testament" },
  { code: "NASB", name: "New American Standard Version" },
  { code: "CEV",  name: "Contemporary English Version" },
  { code: "TANT", name: "The Amplified New Translation" },
];

export default function Footer({ isDarkMode, onNavigateAuthor, onOpenDonate }: FooterProps) {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [pwa, setPwa] = useState(getPwaState);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideMode, setGuideMode] = useState<"ios" | "browser">("browser");

  useEffect(() => {
    fetch(`${API_BASE}/settings.php`)
      .then(r => r.ok ? r.json() : null)
      .then((data: Record<string, string> | null) => {
        if (data) setSettings(data);
      })
      .catch(() => {});
  }, []);

  // Keep the install badge in sync with the browser's installability state.
  useEffect(() => {
    initPwa();
    const sync = () => setPwa({ ...getPwaState() });
    sync();
    return subscribePwa(sync);
  }, []);

  // Google-Play-style badge tap → native prompt, or guide for iOS/desktop.
  const handleInstallTap = async () => {
    if (pwa.isIOS) {
      setGuideMode("ios");
      setGuideOpen(true);
      return;
    }
    const outcome = await promptInstall();
    if (outcome === "unavailable") {
      setGuideMode("browser");
      setGuideOpen(true);
    }
  };

  const showInstallBadge = !pwa.isInstalled && !pwa.isStandalone;

  const telegramQrImage     = settings.telegram_qr_code_image || "/assets/images/dailyImpactQrcode.jpeg";
  const telegramChannelLink = settings.telegram_channel_link  || "https://t.me/dailyimpactdevotional";
  const sponsorCoverImage   = settings.footer_sponsor_image   || settings.homepage_hero_image || "/assets/images/devotional-title-default.jpg";

  const socialLinks = [
    { icon: <Facebook  className="w-3.5 h-3.5 fill-current" />, href: "https://facebook.com/andrewosakwe" },
    { icon: <Twitter   className="w-3.5 h-3.5 fill-current" />, href: "https://twitter.com/andrewosakwe" },
    { icon: <Instagram className="w-3.5 h-3.5" />,              href: "https://instagram.com/andrewosakwe" },
    { icon: <Youtube   className="w-3.5 h-3.5 fill-current" />, href: "https://youtube.com/andrewosakwe" },
  ];

  const card = isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200";
  const alt0 = isDarkMode ? "bg-slate-800/50" : "bg-slate-50";
  const alt1 = isDarkMode ? "bg-transparent" : "bg-white";
  const divider = isDarkMode ? "border-slate-800" : "border-slate-200";

  return (
    <footer
      id="devotional-main-footer"
      className={`border-t pt-10 pb-6 px-4 transition-colors duration-300 ${
        isDarkMode ? "bg-slate-950 border-slate-900 text-slate-400" : "bg-slate-50 border-slate-200 text-slate-600"
      }`}
    >
      <div className="max-w-[1114px] mx-auto space-y-6 relative">

        {/* Scroll to top */}
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className={`absolute -top-16 right-0 p-3 rounded-full border transition-all shadow-md hover:-translate-y-1 ${
            isDarkMode ? "bg-slate-900 border-slate-800 text-slate-300 hover:text-white" : "bg-white border-slate-200 text-slate-600 hover:text-black"
          }`}
          title="Scroll to Top"
        >
          <ArrowUp className="w-4 h-4" />
        </button>

        {/* 3 cards — unequal widths: Keys (big) | QR (small) | Sponsor (medium) */}
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr] gap-5 items-stretch pb-6">

          {/* Card 1 — Bible Translation Keys */}
          <div className={`rounded-2xl border overflow-hidden flex flex-col ${card}`}>
            <div className={`px-4 py-2.5 border-b ${isDarkMode ? "border-slate-800 bg-slate-950/40" : "border-slate-100 bg-slate-50/80"}`}>
              <h3 className={`font-serif font-black text-[10px] uppercase tracking-widest ${isDarkMode ? "text-slate-100" : "text-slate-900"}`}>
                Keys For Bible Translation
              </h3>
            </div>
            <div className="grid grid-cols-2 flex-1">
              {BIBLE_KEYS.map((k, i) => (
                <div
                  key={k.code}
                  className={`flex items-center gap-2 px-3 py-1.5 border-b ${isDarkMode ? "border-slate-800/40" : "border-slate-100"} ${i % 2 === 0 ? alt0 : alt1}`}
                >
                  <span className={`font-mono font-black text-[10px] shrink-0 ${isDarkMode ? "text-teal-400" : "text-teal-brand"}`}>
                    {k.code}
                  </span>
                  <span className={`text-[10px] leading-tight ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>
                    {k.name}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Card 2 — Telegram QR (smallest, middle) */}
          <div className={`rounded-2xl border flex flex-col items-center justify-center gap-3 p-5 text-center ${card}`}>
            <h3 className={`font-serif font-black text-[10px] uppercase tracking-widest ${isDarkMode ? "text-slate-100" : "text-slate-900"}`}>
              Join on Telegram
            </h3>
            <a href={telegramChannelLink} target="_blank" rel="noopener noreferrer">
              <div className="p-2 bg-white border border-slate-200 rounded-xl">
                <img
                  src={telegramQrImage}
                  alt="Telegram QR Code"
                  className="w-28 h-28 object-contain"
                  referrerPolicy="no-referrer"
                />
              </div>
            </a>
            <p className={`text-[9px] leading-relaxed ${isDarkMode ? "text-slate-500" : "text-slate-400"}`}>
              Scan to join our daily devotional channel on mobile.
            </p>
            <a
              href={telegramChannelLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-3 py-1.5 bg-sky-500 hover:bg-sky-600 text-white text-[9px] font-black rounded-full tracking-wider uppercase transition-all"
            >
              Join Channel
            </a>
          </div>

          {/* Card 3 — Sponsor Devotionals (wrapped so button can overflow) */}
          <div className="relative">
            <div className={`rounded-2xl border overflow-hidden relative group cursor-pointer h-full ${card}`} onClick={onOpenDonate}>
              <img
                src={sponsorCoverImage}
                alt="Sponsor Devotionals"
                className="w-full h-full object-cover absolute inset-0 transition-transform duration-700 group-hover:scale-[1.04]"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
              {/* Text centered at the bottom */}
              <div className="relative min-h-[220px] flex flex-col items-center justify-end px-5 pt-5 pb-16 gap-1 text-center">
                <p className="text-[9px] font-black uppercase tracking-widest text-white/60">
                  Support the Ministry
                </p>
                <h3 className="font-serif text-base font-extrabold text-white leading-tight">
                  Help Us Reach More Lives Daily
                </h3>
              </div>
            </div>
            {/* Button floats on the bottom edge of the card, above everything */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 z-[50]">
              <button
                onClick={onOpenDonate}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-teal-brand hover:bg-teal-brand/90 active:scale-[0.97] text-white font-black text-[10px] uppercase tracking-widest rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.35)] transition-all whitespace-nowrap"
              >
                <Heart className="w-3 h-3 fill-current" />
                Sponsor Devotionals
              </button>
            </div>
          </div>

        </div>

        {/* Divider */}
        <div className={`w-full h-px ${divider}`} />

        {/* Get the App — Google-Play-style install badge (hidden once installed) */}
        {showInstallBadge && (
          <div className="flex justify-center pt-1">
            <button
              onClick={handleInstallTap}
              className="group inline-flex items-center gap-3 rounded-xl px-4 py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-700/60 shadow-[0_10px_30px_-10px_rgba(2,6,23,0.6)] transition-all active:scale-[0.97]"
              aria-label="Install Daily Impact app"
            >
              <span className="relative flex items-center justify-center">
                <span className="absolute inline-flex h-8 w-8 rounded-full bg-teal-brand/0 group-hover:bg-teal-brand/20 transition-colors" />
                <span className="w-8 h-8 rounded-lg bg-teal-brand flex items-center justify-center">
                  <Play className="w-4 h-4 text-white fill-white ml-0.5" />
                </span>
              </span>
              <span className="text-left leading-none">
                <span className="block text-[8px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  Get it on
                </span>
                <span className="block mt-1 text-[13px] font-black text-white tracking-wide">
                  Daily Impact App
                </span>
              </span>
            </button>
          </div>
        )}

        {/* Bottom bar — left / center / right */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-[10px]">

          {/* Left — social + follow label */}
          <div className="flex items-center gap-3">
            <span className={`font-black uppercase tracking-widest hidden sm:block ${isDarkMode ? "text-slate-500" : "text-slate-400"}`}>
              Follow
            </span>
            <div className="flex gap-2">
              {socialLinks.map((s, i) => (
                <a
                  key={i}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`w-7 h-7 rounded-full flex items-center justify-center border transition-all ${
                    isDarkMode
                      ? "bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white"
                      : "bg-white border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-black"
                  }`}
                >
                  {s.icon}
                </a>
              ))}
            </div>
          </div>

          {/* Center — nav links + copyright */}
          <div className="flex flex-col items-center gap-1.5 text-center">
            <div className="flex flex-wrap justify-center items-center gap-x-4 gap-y-1 font-bold uppercase tracking-wider">
              <button onClick={onNavigateAuthor} className="text-teal-brand hover:underline uppercase tracking-wider font-bold">
                About the Author
              </button>
              <span className={isDarkMode ? "text-slate-700" : "text-slate-300"}>·</span>
              <a href="/foreword" className={`hover:underline ${isDarkMode ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-black"}`}>
                Foreword
              </a>
              <span className={isDarkMode ? "text-slate-700" : "text-slate-300"}>·</span>
              <a href={telegramChannelLink} target="_blank" rel="noopener noreferrer" className="text-sky-500 hover:underline">
                Telegram
              </a>
            </div>
            <p className={`font-medium ${isDarkMode ? "text-slate-600" : "text-slate-400"}`}>
              © {new Date().getFullYear()} Daily Impact Devotional. All Rights Reserved.
            </p>
          </div>

          {/* Right — contact + admin */}
          <div className="flex flex-col items-end gap-1 text-right">
            <span className={`flex items-center gap-1 font-bold ${isDarkMode ? "text-slate-500" : "text-slate-400"}`}>
              <Mail className="w-3 h-3 text-teal-brand/70" />
              info@andrewosakweministries.org
            </span>
            <span className={`flex items-center gap-1 font-bold ${isDarkMode ? "text-slate-500" : "text-slate-400"}`}>
              <Phone className="w-3 h-3 text-teal-brand/70" />
              +2348177445013
            </span>
            <a
              href="/admin/login"
              className={`font-mono tracking-widest uppercase transition-colors ${isDarkMode ? "text-slate-900 hover:text-slate-500" : "text-slate-200 hover:text-slate-400"}`}
            >
              Admin
            </a>
          </div>

        </div>

      </div>

      {/* Manual install instructions (iOS / non-Chromium fallback) */}
      <InstallGuideModal
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        isDarkMode={isDarkMode}
        mode={guideMode}
      />
    </footer>
  );
}
