import React, { useEffect, useState } from "react";
import { API_BASE } from "../config/api";
import { BookMarked, Send, Search, QrCode, User, Globe, ChevronDown, ChevronUp } from "lucide-react";

interface SidebarProps {
  isDarkMode: boolean;
}

export default function Sidebar({ isDarkMode }: SidebarProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [showAllBio, setShowAllBio] = useState(false);
  const [settings, setSettings] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch(`${API_BASE}/settings.php`)
      .then(r => r.ok ? r.json() : null)
      .then((data: Record<string, string> | null) => {
        if (data) setSettings(data);
      })
      .catch(() => {});
  }, []);

  const pastorPortraitImage = settings.pastor_portrait_image || settings.author_image || "/assets/images/dr-andy-osakwe.jpg";
  const telegramQrImage = settings.telegram_qr_code_image || "/assets/images/dailyImpactQrcode.jpeg";
  const telegramChannelLink = settings.telegram_channel_link || "https://t.me/dailyimpactdevotional";

  const bibleKeys = [
    { code: "NKJV", name: "New King James Version" },
    { code: "AMP", name: "The Amplified Bible" },
    { code: "TLB", name: "The Living Bible" },
    { code: "ISV", name: "International Standard Version" },
    { code: "NIV", name: "New International Version" },
    { code: "MSG", name: "The Message Translation" },
    { code: "WEB", name: "The World English Bible" },
    { code: "TNLT", name: "The New Living Translation" },
    { code: "TEV", name: "Today's English Version" },
    { code: "RSV", name: "Revised Standard Version" },
    { code: "GNB", name: "Good News Bible" },
    { code: "WNT", name: "Weymouth New Testament" },
    { code: "NASB", name: "New American Standard version" },
    { code: "CEV", name: "Contemporary English Version" },
    { code: "TANT", name: "The Amplified New Translation" },
  ];

  const filteredKeys = bibleKeys.filter(
    (bk) =>
      bk.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      bk.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <aside id="sidebar-panel" className="space-y-8 lg:sticky lg:top-24">
      
      {/* 1. Keys For Bible Translation */}
      <div
        id="bible-keys-card"
        className={`rounded-2xl p-6 border transition-all duration-300 ${
          isDarkMode 
            ? "bg-slate-950 border-slate-900 shadow-xl shadow-black/40" 
            : "bg-white border-slate-100 shadow-xl shadow-slate-200/70"
        }`}
      >
        <div className="flex items-center gap-2 mb-4 border-b border-slate-50 dark:border-slate-900 pb-3">
          <BookMarked className="w-5 h-5 text-black dark:text-white" />
          <h3 className="font-serif font-semibold text-sm uppercase tracking-wider text-slate-900 dark:text-slate-100">
            Keys For Bible Translation
          </h3>
        </div>

        {/* Translation search filter */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search translation..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full py-2.5 pl-9 pr-4 text-xs rounded-xl focus:outline-none focus:border-black dark:focus:border-white border ${
              isDarkMode
                ? "bg-slate-900 border-slate-800 text-slate-100"
                : "bg-slate-50 border-slate-200 text-slate-700"
            }`}
          />
        </div>

        {/* Translation Keys Grid - Interactive monochrome design */}
        <div className="max-h-[250px] overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-slate-300">
          {filteredKeys.length > 0 ? (
            filteredKeys.map((bk) => (
              <div
                key={bk.code}
                className={`flex items-center justify-between text-xs p-2 rounded-lg border transition-all ${
                  isDarkMode
                    ? "bg-slate-900/40 border-slate-800 hover:bg-white hover:text-black group"
                    : "bg-slate-50/50 border-slate-100 hover:bg-black hover:text-white hover:border-black group"
                }`}
              >
                <span className={`font-mono font-black px-1.5 py-0.5 rounded text-[10px] ${
                  isDarkMode
                    ? "bg-slate-800 text-slate-200 group-hover:bg-slate-200 group-hover:text-black"
                    : "bg-slate-200 text-slate-700 group-hover:bg-slate-900 group-hover:text-white"
                } transition-colors`}>
                  {bk.code}
                </span>
                <span className={`text-slate-700 dark:text-slate-300 font-black group-hover:text-inherit text-right truncate pl-4 transition-colors`}>
                  {bk.name}
                </span>
              </div>
            ))
          ) : (
            <p className="text-[11px] text-slate-400 italic text-center py-4">No matching translations</p>
          )}
        </div>
      </div>

      {/* 2. Join Telegram Channel (With real QR code) */}
      <div
        id="telegram-card"
        className={`rounded-2xl overflow-hidden border transition-all duration-300 ${
          isDarkMode 
            ? "bg-slate-950 border-slate-900 shadow-xl shadow-black/40" 
            : "bg-white border-slate-100 shadow-xl shadow-slate-200/70"
        }`}
      >
        <a
          href={telegramChannelLink}
          target="_blank"
          rel="noopener noreferrer"
          className="block bg-gradient-to-br from-black to-slate-800 p-6 text-white text-center relative hover:opacity-95 transition-all group"
        >
          <div className="absolute top-3 right-3 bg-white/20 p-1.5 rounded-full group-hover:scale-110 transition-transform">
            <Send className="w-3.5 h-3.5 fill-white text-slate-800 rotate-45" />
          </div>
          <h4 className="text-xs font-extrabold uppercase tracking-widest text-slate-300 mb-1">
            Stay Connected
          </h4>
          <p className="font-serif text-lg font-bold leading-tight mb-2">
            Get the Devotional Daily on Telegram!
          </p>
          <span
            className="inline-block mt-1 px-4 py-1.5 bg-white text-black text-[11px] font-black rounded-full tracking-wider hover:bg-slate-100 transition-all uppercase shadow-md"
          >
            Join Telegram Channel
          </span>
        </a>

        {/* Real QR code image from user URL */}
        <div className="p-6 bg-white flex flex-col items-center">
          <div className="relative p-2 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center overflow-hidden">
            <img
              src={telegramQrImage}
              alt="Daily Impact Telegram QR Code"
              className="w-32 h-32 object-contain"
              referrerPolicy="no-referrer"
            />
          </div>
          <span className="text-[10px] text-slate-400 font-mono mt-3 uppercase tracking-wider">
            Scan to Join on Mobile
          </span>
        </div>
      </div>

      {/* 3. About The Author */}
      <div
        id="author-card"
        className={`rounded-2xl overflow-hidden border transition-all duration-300 ${
          isDarkMode 
            ? "bg-slate-950 border-slate-900 shadow-xl shadow-black/40" 
            : "bg-white border-slate-100 shadow-xl shadow-slate-200/70"
        }`}
      >
        <div className="relative h-[420px] bg-slate-50 dark:bg-slate-950 flex items-center justify-center overflow-hidden border-b border-slate-100 dark:border-slate-900">
          {/* Real friendly, approachable male portrait image of Dr. Andy Osakwe - fully fitting and never cut off */}
          <img
            src={pastorPortraitImage}
            alt="Dr. Andy Osakwe"
            className="w-full h-full object-contain"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-5 flex flex-col justify-end h-28">
            <h4 className="font-serif font-bold text-base leading-tight text-white">Dr. Andy Osakwe</h4>
            <p className="text-[10px] tracking-wider text-slate-300 uppercase font-black">Author & Founder</p>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <p className={`text-xs md:text-sm leading-relaxed ${isDarkMode ? "text-slate-300" : "text-slate-800"}`}>
            Dr. Andy Osakwe is the founder of Andrew Osakwe Ministries International and the Senior Pastor of Summit
            Bible Church. He is deeply committed to taking the message of the new creation to the nations of the earth.
            
            {showAllBio && (
              <span className="inline mt-1.5 transition-all duration-300">
                {" "}With a unique apostolic mantle, he teaches the Word of God with simplicity, clarity, and authority,
                helping believers discover their inheritance in Christ and walk in divine destiny. He operates in
                divine wisdom and is a father and mentor to many ministers across the globe.
              </span>
            )}
          </p>

          <button
            onClick={() => setShowAllBio(!showAllBio)}
            className="text-xs font-bold text-black dark:text-white hover:opacity-80 transition-opacity flex items-center gap-1 uppercase tracking-wider"
          >
            {showAllBio ? (
              <>
                Show Less <ChevronUp className="w-3.5 h-3.5" />
              </>
            ) : (
              <>
                Read More <ChevronDown className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>

    </aside>
  );
}
