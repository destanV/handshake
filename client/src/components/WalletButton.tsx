"use client"

import {useAccount, useChainId, useConnect, useDisconnect, useSignMessage} from 'wagmi'
import {SiweMessage} from 'siwe'
import {useState} from 'react'
import {apiService} from '@/services/ApiService'
import {useAuth} from '@/contexts/AuthContext'
import {Button} from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function WalletButton() {
    const {address, isConnected} = useAccount()
    const {connectAsync, connectors} = useConnect()
    const {disconnect} = useDisconnect()
    const {signMessageAsync} = useSignMessage()
    const chainId = useChainId()
    const {isAuthenticated, checkAuth} = useAuth()
    const [isConnecting, setIsConnecting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleConnectAndSignIn = async () => {
        setIsConnecting(true)
        setError(null)

        try {
            const walletAddress = await connectWallet();

            await performSiweAuth(walletAddress);

            await checkAuth()

        } catch (err: any) {
            console.error('Auth flow error:', err)
            setError(err.message || 'Failed to authenticate')

            if (!isConnected) {
                disconnect()
            }
        } finally {
            setIsConnecting(false)
        }
    }

    const connectWallet = async () => {
        const result = await connectAsync({connector: connectors[0]});
        return result.accounts[0];
    };

    const performSiweAuth = async (walletAddress: `0x${string}` | undefined)=> {
        try {
            const {nonce} = await apiService.getNonce();

            const message = new SiweMessage({
                domain: window.location.host,
                address: walletAddress,
                statement: 'Sign in to Handshake - Decentralized AI Model Hub',
                uri: window.location.origin,
                version: '1',
                chainId,
                nonce,
            });

            const signature = await signMessageAsync({
                message: message.prepareMessage()
            });

            await apiService.verifySiweSignature(message.prepareMessage(), signature);
        } catch (err: any) {
            console.error('SIWE authentication error:', err);
            throw err;
        }
    }

    const handleLogout = async () => {
        try {
            await apiService.logout()
            await checkAuth()
        } catch (error) {
            console.error('Logout error:', error)
            await checkAuth()
        }
    }

    const handleDisconnect = async () => {
        try {
            await apiService.logout()
            disconnect()
            await checkAuth()
        } catch (error) {
            console.error('Disconnect error:', error)
            disconnect()
            await checkAuth()
        }
    }

    /**
     * Retry authentication for already-connected wallets
     * Used when user is in yellow dot state (connected but not authenticated)
     */
    const handleRetrySignIn = async () => {
        if (!address) {
            setError('No wallet connected');
            return;
        }

        setIsConnecting(true);
        setError(null);

        try {
            await performSiweAuth(address);
            await checkAuth();
        } catch (err: any) {
            console.error('Sign-in retry error:', err);
            setError(err.message || 'Failed to sign in');
        } finally {
            setIsConnecting(false);
        }
    };

    if (!isConnected) {
        return (
            <div className="flex flex-col items-end gap-1">
                <Button onClick={handleConnectAndSignIn} disabled={isConnecting}>
                    {isConnecting ? 'Connecting...' : 'Connect & Sign In'}
                </Button>
                {error && <p className="text-xs text-red-500">{error}</p>}
            </div>
        )
    }

    if (!isAuthenticated) {
        return (
            <div className="flex flex-col items-end gap-2">
                <div className="flex gap-2">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="font-mono">
                                <span className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-yellow-500"/>
                                    {address?.slice(0, 6)}...{address?.slice(-4)}
                                </span>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <div className="px-2 py-1.5 text-xs">
                                <p className="flex items-center gap-2 text-yellow-600">
                                    <span className="w-2 h-2 rounded-full bg-yellow-500"/>
                                    Not Signed In
                                </p>
                            </div>
                            <DropdownMenuSeparator/>
                            <DropdownMenuItem onClick={handleDisconnect} className="text-red-600">
                                <span className="flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                                    </svg>
                                    Disconnect
                                </span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <Button onClick={handleRetrySignIn} disabled={isConnecting}>
                        {isConnecting ? 'Signing...' : 'Sign In'}
                    </Button>
                </div>
                {error && <p className="text-xs text-red-500">{error}</p>}
            </div>
        )
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" className="font-mono">
                    <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500"/>
                        {address?.slice(0, 6)}...{address?.slice(-4)}
                    </span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
                <div className="px-2 py-1.5 text-sm">
                    <p className="font-semibold">Wallet</p>
                    <p className="text-xs text-gray-500 font-mono">{address?.slice(0, 8)}...{address?.slice(-6)}</p>
                </div>
                <DropdownMenuSeparator/>
                <div className="px-2 py-1.5 text-xs">
                    <p className="flex items-center gap-2 text-green-600">
                        <span className="w-2 h-2 rounded-full bg-green-500"/>
                        Authenticated
                    </p>
                </div>
                <DropdownMenuSeparator/>
                <DropdownMenuItem onClick={handleLogout}>
                    <span className="flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
                        </svg>
                        Logout
                    </span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDisconnect} className="text-red-600">
                    <span className="flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                        Disconnect Wallet
                    </span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
