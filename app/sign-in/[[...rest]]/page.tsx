'use client'

import { SignIn } from '@clerk/nextjs'

export default function SignInPage() {
  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#050510]">

      {/* Animated gradient blobs */}
      <div className="absolute inset-0 z-0">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
      </div>

      {/* Noise overlay for texture */}
      <div className="absolute inset-0 z-10 opacity-[0.03] bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIj48ZmlsdGVyIGlkPSJub2lzZSI+PGZlVHVyYnVsZW5jZSB0eXBlPSJmcmFjdGFsTm9pc2UiIGJhc2VGcmVxdWVuY3k9IjAuNjUiIG51bU9jdGF2ZXM9IjMiIHN0aXRjaFRpbGVzPSJzdGl0Y2giLz48L2ZpbHRlcj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjMwMCIgZmlsdGVyPSJ1cmwoI25vaXNlKSIgb3BhY2l0eT0iMSIvPjwvc3ZnPg==')]" />

      {/* Content */}
      <div className="relative z-20 flex flex-col items-center gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-white tracking-tight">
            Automation Culture Client Portal
          </h1>
          <p className="text-sm text-white/50 mt-1">
            We automate the gruntwork. You take care of business.
          </p>
        </div>
        <SignIn />
      </div>

      <style>{`
        .blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.5;
          animation: drift linear infinite;
        }
        .blob-1 {
          width: 600px;
          height: 600px;
          background: radial-gradient(circle, #7c3aed, #4f46e5);
          top: -100px;
          left: -100px;
          animation-duration: 18s;
          animation-delay: 0s;
        }
        .blob-2 {
          width: 500px;
          height: 500px;
          background: radial-gradient(circle, #0ea5e9, #6366f1);
          bottom: -80px;
          right: -80px;
          animation-duration: 22s;
          animation-delay: -6s;
        }
        .blob-3 {
          width: 400px;
          height: 400px;
          background: radial-gradient(circle, #8b5cf6, #06b6d4);
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          animation-duration: 26s;
          animation-delay: -12s;
        }
        @keyframes drift {
          0%   { transform: translate(0px, 0px) scale(1); }
          25%  { transform: translate(40px, -30px) scale(1.05); }
          50%  { transform: translate(-20px, 40px) scale(0.95); }
          75%  { transform: translate(-40px, -20px) scale(1.03); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        .blob-3 {
          animation-name: drift-center;
        }
        @keyframes drift-center {
          0%   { transform: translate(-50%, -50%) scale(1); }
          25%  { transform: translate(calc(-50% + 30px), calc(-50% - 40px)) scale(1.08); }
          50%  { transform: translate(calc(-50% - 30px), calc(-50% + 30px)) scale(0.92); }
          75%  { transform: translate(calc(-50% + 20px), calc(-50% + 40px)) scale(1.05); }
          100% { transform: translate(-50%, -50%) scale(1); }
        }
      `}</style>
    </div>
  )
}
