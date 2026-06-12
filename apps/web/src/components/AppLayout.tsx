"use client"

import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Separator } from "@/components/ui/separator"
import { AppSidebar } from "@/components/AppSidebar"
import { WalletConnectButton } from "@/components/WalletConnectButton"
import { ExternalPendingPopup } from "@/components/ExternalPendingPopup"

interface AppLayoutProps {
  children: React.ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <TooltipProvider>
      <SidebarProvider defaultOpen={true}>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-12 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="h-4" />
            <div className="flex-1" />
            <WalletConnectButton />
          </header>
          {children}
        </SidebarInset>
      </SidebarProvider>
      <ExternalPendingPopup />
    </TooltipProvider>
  )
}
