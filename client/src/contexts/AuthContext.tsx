"use client"

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { apiService } from '@/services/ApiService'

interface AuthContextType {
  isAuthenticated: boolean
  walletAddress: string | null
  loading: boolean
  checkAuth: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const checkAuth = async () => {
    setLoading(true)
    try {
      const result = await apiService.checkAuth()
      setIsAuthenticated(result.authenticated)
      setWalletAddress(result.walletAddress || null)
    } catch (error) {
      console.error('Auth check failed:', error)
      setIsAuthenticated(false)
      setWalletAddress(null)
    } finally {
      setLoading(false)
    }
  }

  // Check auth on mount
  useEffect(() => {
    checkAuth()
  }, [])

  return (
    <AuthContext.Provider value={{ isAuthenticated, walletAddress, loading, checkAuth }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
