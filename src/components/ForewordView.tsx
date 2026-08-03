import React from "react";
import { BookOpen, User, Clock } from "lucide-react";
import { ForewordPost } from "../types";

interface ForewordViewProps {
  post: ForewordPost;
  isDarkMode: boolean;
}

export default function ForewordView({ post, isDarkMode }: ForewordViewProps) {
  return (
    <article
      className={`rounded-3xl p-6 md:p-10 border transition-colors duration-300 ${
        isDarkMode
          ? "bg-slate-900/60 border-slate-800 text-slate-100"
          : "bg-white border-slate-100 text-slate-900"
      }`}
    >
      {/* Header */}
      <header className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <BookOpen className="w-4 h-4 text-teal-brand" />
          <span className="text-[10px] font-black uppercase tracking-widest text-teal-brand">
            Foreword
          </span>
        </div>

        <h1 className="font-serif text-3xl md:text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight text-slate-900 dark:text-white mb-4">
          {post.title}
        </h1>

        <div className="w-16 h-[2px] bg-slate-900 dark:bg-white rounded-full mb-6" />

        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400 font-bold">
          <span className="flex items-center gap-1.5">
            <User className="w-3.5 h-3.5" />
            {post.author}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            {new Date(post.publishedAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </span>
        </div>
      </header>

      {/* Body */}
      <section
        className={`prose prose-sm md:prose-base max-w-none text-justify leading-relaxed space-y-5 ${
          isDarkMode ? "text-slate-300" : "text-slate-800"
        }`}
        dangerouslySetInnerHTML={{ __html: post.content }}
      />
    </article>
  );
}
