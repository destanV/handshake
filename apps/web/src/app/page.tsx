"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ShaderAnimation } from "@/components/ui/shader-lines"
import { useAuth } from "@/contexts/AuthContext"

export default function LandingPage() {
  const { isAuthenticated } = useAuth()

  return (
    <div className="relative h-svh w-full overflow-hidden flex items-center justify-center">
      <ShaderAnimation />
      <div className="relative z-10 text-center px-4">
        <p className="text-xs uppercase tracking-widest text-white/50 mb-4 pointer-events-none">
          Decentralized AI Model Hub
        </p>
        <h1 className="text-7xl sm:text-8xl lg:text-9xl font-semibold tracking-tighter text-white whitespace-pre-wrap pointer-events-none ">
          Handshake
        </h1>
        <p className="mt-6 text-sm sm:text-base text-white/60 max-w-sm mx-auto leading-relaxed pointer-events-none">
          Cryptographic ownership. Provenance-tracked. Decentralized Inference for AI Models
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Button
            size="lg"
            className="bg-white text-black hover:bg-white/90"
            asChild
          >
            <Link href="/registry">Explore Registry</Link>
          </Button>
          <Button
            size="lg"
            className="bg-white/10 text-white border border-white/20 hover:bg-white/20 backdrop-blur-sm"
            disabled={!isAuthenticated}
            asChild={isAuthenticated}
            title={!isAuthenticated ? "Connect your wallet to upload" : undefined}
          >
            {isAuthenticated ? (
              <Link href="/upload">Upload a Model</Link>
            ) : (
              <span>Upload a Model</span>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
