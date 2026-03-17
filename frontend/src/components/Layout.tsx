import { Link, Outlet, useLocation } from "react-router-dom"
import { Wallet, LogOut, Compass, PlusCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useWallet } from "@/hooks/useWallet"
import { formatAddress, cn } from "@/lib/utils"

export function Layout() {
  const { connected, address, connect, disconnect } = useWallet()
  const location = useLocation()

  return (
    <div className="min-h-dvh flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/95">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
              <img src="/logo-icon.png" alt="ShieldPad" className="size-8 rounded-lg" />
              <span className="text-base font-semibold">
                ShieldPad
              </span>
            </Link>

            <nav className="hidden items-center gap-1 sm:flex">
              <Link to="/">
                <Button
                  variant={location.pathname === "/" ? "secondary" : "ghost"}
                  size="sm"
                  className={cn(
                    "gap-1.5",
                    location.pathname === "/" && "bg-secondary"
                  )}
                >
                  <Compass className="size-3.5" />
                  Explore
                </Button>
              </Link>
              <Link to="/create">
                <Button
                  variant={location.pathname === "/create" ? "secondary" : "ghost"}
                  size="sm"
                  className={cn(
                    "gap-1.5",
                    location.pathname === "/create" && "bg-secondary"
                  )}
                >
                  <PlusCircle className="size-3.5" />
                  Create
                </Button>
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-2">
            {connected ? (
              <div className="flex items-center gap-2">
                <div className="hidden items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400 sm:flex">
                  <div className="size-1.5 rounded-full bg-emerald-400" />
                  {formatAddress(address ?? "")}
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={disconnect}
                  aria-label="Disconnect wallet"
                  className="text-muted-foreground hover:text-destructive"
                >
                  <LogOut className="size-3.5" />
                </Button>
              </div>
            ) : (
              <Button onClick={connect} size="sm" className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700">
                <Wallet className="size-3.5" />
                Connect Wallet
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-border/50">
        <div className="mx-auto flex h-12 max-w-6xl items-center justify-center px-4">
          <p className="text-xs text-muted-foreground text-pretty">
            Built on{" "}
            <span className="font-medium text-foreground/70">Stacks</span>
            {" "}&middot;{" "}
            <span className="font-medium text-emerald-400">BUIDL BATTLE #2</span>
          </p>
        </div>
      </footer>
    </div>
  )
}
