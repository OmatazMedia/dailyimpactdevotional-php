import React, { useEffect, useState } from "react";
import { API_BASE } from "../config/api";

interface AuthorPageProps {
  isDarkMode: boolean;
}

export default function AuthorPage({ isDarkMode }: AuthorPageProps) {
  const [settings, setSettings] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch(`${API_BASE}/settings.php`)
      .then(r => r.ok ? r.json() : null)
      .then((data: Record<string, string> | null) => {
        if (data) setSettings(data);
      })
      .catch(() => {});
  }, []);

  const name    = settings.author_name  || "Dr. Andy Osakwe";
  const title   = settings.author_title || "Author & Founder";
  const bio     = settings.author_bio   || "Dr. Andy Osakwe is the founder of Andrew Osakwe Ministries International and the Senior Pastor of Summit Bible Church. He is deeply committed to taking the message of the new creation to the nations of the earth. With a unique apostolic mantle, he teaches the Word of God with simplicity, clarity, and authority, helping believers discover their inheritance in Christ and walk in divine destiny. He operates in divine wisdom and is a father and mentor to many ministers across the globe.";
  const image   = settings.author_image || settings.pastor_portrait_image || "/assets/images/dr-andy-osakwe.jpg";

  return (
    <div className={`rounded-3xl border overflow-hidden ${ isDarkMode ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-100" }`}>
      <div className="flex flex-col md:flex-row">

        {/* Left: Author Image */}
        <div className="md:w-2/5 shrink-0">
          <div className="h-72 md:h-full min-h-[320px] bg-slate-100 dark:bg-slate-950 overflow-hidden">
            <img
              src={image}
              alt={name}
              className="w-full h-full object-cover object-top"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>

        {/* Right: Author Details */}
        <div className="flex-1 p-8 md:p-12 flex flex-col justify-center space-y-6">
          <div className="space-y-1">
            <p className={`text-[10px] font-black uppercase tracking-widest ${ isDarkMode ? "text-slate-500" : "text-slate-400" }`}>
              About the Author
            </p>
            <h1 className={`font-serif text-3xl md:text-4xl font-extrabold tracking-tight ${ isDarkMode ? "text-white" : "text-slate-900" }`}>
              {name}
            </h1>
            <p className="text-teal-brand font-bold text-sm uppercase tracking-wider">
              {title}
            </p>
          </div>

          <div className="w-12 h-[2px] bg-teal-brand rounded-full" />

          <div className="space-y-4">
            {bio.split("\n").filter(Boolean).map((para, i) => (
              <p key={i} className={`text-sm leading-relaxed ${ isDarkMode ? "text-slate-300" : "text-slate-700" }`}>
                {para}
              </p>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
