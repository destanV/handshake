"use client"

import { WalletButton } from "@/components/WalletButton";
import { UploadModal } from "@/components/UploadModal"
import { useAccount } from "wagmi"
import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { apiService } from "@/services/ApiService"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

interface IModel {
  _id: string
  name: string
  type: string
  modelFileCid: string
  metadataCid: string
  modelHash: string
  ownerAddress: string
  createdAt: string
  updatedAt: string
}

export default function Home() {
  const [models, setModels] = useState<IModel[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchModels() {
      try {
        const data = await apiService.getModels()
        setModels(data)
      } catch (error) {
        console.error('Failed to fetch data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchModels()
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Navbar */}
      <nav className="border-b bg-white/80 backdrop-blur-md sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center shadow-md">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Handshake</h1>
                <p className="text-xs text-gray-500 -mt-1">Decentralized AI Hub</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <UploadModal />
              <WalletButton />
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-3xl font-bold text-gray-900">Model Registry</h2>
              <p className="text-gray-600 mt-1">
                Explore AI models on a decentralized platform.
              </p>
            </div>
            <Badge variant="secondary" className="text-sm px-4 py-2">
              {models.length} {models.length === 1 ? 'Model' : 'DataModels'}
            </Badge>
          </div>
        </div>

        {/* Models Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="h-3 bg-gray-200 rounded"></div>
                    <div className="h-3 bg-gray-200 rounded w-5/6"></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : models.length === 0 ? (
          <Card className="p-12 flex flex-col items-center justify-center text-center border-dashed">
            <div className="text-muted-foreground">
              <p className="text-lg font-medium">No models found</p>
              <p className="text-sm">Upload your first AI model to get started.</p>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {models.map((model) => (
              <Card key={model._id} className="group hover:shadow-md transition-all duration-200">
                <CardHeader>
                  <div className="flex justify-between items-start gap-2">
                    <div className="space-y-1">
                      <CardTitle className="text-xl leading-none">
                        {model.name}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        ID: {model._id.slice(-6)}
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="capitalize">
                      {model.type}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="rounded-md bg-muted/50 p-3 space-y-2 text-xs font-mono text-muted-foreground">
                    <div className="flex flex-col gap-1">
                      <span className="font-semibold text-foreground/80">Hash:</span>
                      <span className="break-all select-all">
                        {model.modelHash}
                      </span>
                    </div>

                    <Separator className="bg-muted-foreground/20" />

                    <div className="flex justify-between">
                      <span className="font-semibold text-foreground/80">Owner:</span>
                      <span title={model.ownerAddress} className="">
                        {model.ownerAddress}
                      </span>
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="font-semibold text-foreground/80">Metadata CID:</span>
                      <a
                        href={`https://ipfs.io/ipfs/${model.metadataCid}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:text-blue-600 hover:underline break-all cursor-pointer"
                      >
                        {model.metadataCid}
                      </a>
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="font-semibold text-foreground/80">Model File CID:</span>
                      {model.modelFileCid}
                    </div>
                  </div>
                </CardContent>

                <CardFooter className="text-xs text-muted-foreground flex justify-between border-t bg-muted/10 py-3">
                  <span>Uploaded {new Date(model.createdAt).toLocaleDateString()}</span>
                  <span>{new Date(model.updatedAt).toLocaleTimeString()}</span>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}

        {models.length > 0 && (
          <div className="mt-12 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-1">
                  Phase 1: Web3 Authentication Active
                </h3>
                <p className="text-sm text-gray-700">
                  All models are cryptographically signed and stored on IPFS.
                  Phase 2 (Smart Contracts) coming soon for on-chain provenance.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t bg-white/50 backdrop-blur-sm mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-gray-600">
              Decentralization 🚀
            </p>
            <div className="flex gap-6 text-sm text-gray-600">
              <a href="https://github.com" className="hover:text-gray-900 transition-colors">
                GitHub
              </a>
              <a href="https://docs.avax.network" className="hover:text-gray-900 transition-colors">
                Documentation
              </a>
              <a href="#" className="hover:text-gray-900 transition-colors">
                About
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
