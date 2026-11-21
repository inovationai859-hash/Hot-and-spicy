import React from 'react';
import { ArrowLeft, Flame, Home, RotateCw, ShieldAlert } from 'lucide-react';

interface CustomErrorPageProps {
  statusCode?: 404 | 500;
  onReset?: () => void;
}

export const CustomErrorPage: React.FC<CustomErrorPageProps> = ({
  statusCode = 404,
  onReset,
}) => {
  const isNotFound = statusCode === 404;

  const title = isNotFound
    ? 'This Table Could Not Be Found'
    : 'A Temporary Kitchen Hiccup Occurred';

  const subtitle = isNotFound
    ? 'The page you requested does not exist or may have moved. Head back to our Bansberia kitchen & lounge to browse the menu or book a table.'
    : 'Our dining experience hit a brief snag while preparing this view. Your cart and active session remain safe—please reload or go back.';

  const handleGoBack = () => {
    try {
      if (window.history.length > 1) {
        window.history.back();
        return;
      }
    } catch {}
    if (onReset) {
      onReset();
      return;
    }
    window.location.href = '/';
  };

  const handleGoHome = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (onReset) {
      e.preventDefault();
      onReset();
    }
  };

  return (
    <div className="min-h-screen bg-[#E4D6C3] dark:bg-[#120E0A] text-[#14100B] dark:text-[#F0E6D8] flex items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-3xl bg-[#EFE5D6] dark:bg-[#1F1710] border border-[#C2AD93] dark:border-[#3D2F20] shadow-2xl p-8 sm:p-10 text-center space-y-6">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-[#8D6613] dark:bg-[#D8B467] text-[#FAF2E6] dark:text-[#14100B] flex items-center justify-center shadow-md">
          {isNotFound ? (
            <Flame className="w-7 h-7" aria-hidden="true" />
          ) : (
            <ShieldAlert className="w-7 h-7" aria-hidden="true" />
          )}
        </div>

        <div className="space-y-2">
          <p className="font-mono-clean text-xs font-bold uppercase tracking-[0.22em] text-[#8D6613] dark:text-[#D8B467]">
            Error {statusCode}
          </p>
          <h1 className="font-luxury text-3xl sm:text-4xl font-bold text-[#14100B] dark:text-[#F0E6D8] leading-tight">
            {title}
          </h1>
        </div>

        <p className="text-sm sm:text-base text-[#3B3126] dark:text-[#D4C5B3] leading-relaxed">
          {subtitle}
        </p>

        <div className="pt-2 flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={handleGoBack}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 min-h-[44px] rounded-xl border border-[#C2AD93] dark:border-[#3D2F20] bg-[rgba(228,214,195,0.6)] dark:bg-[rgba(18,14,10,0.6)] hover:bg-[#D9C7B0] dark:hover:bg-[#2A2016] text-[#14100B] dark:text-[#F0E6D8] font-bold text-xs uppercase tracking-wider cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            Go Back
          </button>
          <a
            href="/"
            onClick={handleGoHome}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 min-h-[44px] rounded-xl bg-[#8D6613] hover:bg-[#73520D] dark:bg-[#D8B467] dark:hover:bg-[#C69F4E] text-[#FAF2E6] dark:text-[#14100B] font-bold text-xs uppercase tracking-wider shadow-sm"
          >
            <Home className="w-4 h-4" aria-hidden="true" />
            Return to Hot &amp; Spicy
          </a>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 min-h-[44px] rounded-xl border border-[#C2AD93] dark:border-[#3D2F20] bg-[rgba(228,214,195,0.6)] dark:bg-[rgba(18,14,10,0.6)] hover:bg-[#D9C7B0] dark:hover:bg-[#2A2016] text-[#14100B] dark:text-[#F0E6D8] font-bold text-xs uppercase tracking-wider cursor-pointer"
          >
            <RotateCw className="w-4 h-4" aria-hidden="true" />
            Reload Page
          </button>
        </div>
      </div>
    </div>
  );
};
