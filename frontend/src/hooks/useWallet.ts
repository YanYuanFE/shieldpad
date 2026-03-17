import { useState, useCallback, useEffect } from "react"
import {
  connect,
  disconnect as stacksDisconnect,
  isConnected,
  getLocalStorage,
} from "@stacks/connect"

interface WalletState {
  connected: boolean
  address: string | null
  stxAddress: string | null
}

function readWalletState(): WalletState {
  try {
    if (!isConnected()) {
      return { connected: false, address: null, stxAddress: null }
    }
    const storage = getLocalStorage()
    const addr = storage?.addresses?.stx?.[0]?.address ?? null
    return { connected: true, address: addr, stxAddress: addr }
  } catch {
    return { connected: false, address: null, stxAddress: null }
  }
}

export function useWallet() {
  const [wallet, setWallet] = useState<WalletState>(readWalletState)

  useEffect(() => {
    setWallet(readWalletState())
  }, [])

  useEffect(() => {
    const handler = () => setWallet(readWalletState())
    window.addEventListener("storage", handler)
    return () => window.removeEventListener("storage", handler)
  }, [])

  const connectWallet = useCallback(async () => {
    try {
      await connect({ enableLocalStorage: true, network: "testnet" })
      // After connect() resolves, localStorage is populated
      setWallet(readWalletState())
    } catch {
      // User cancelled — re-check in case state was partially saved
      setWallet(readWalletState())
    }
  }, [])

  const disconnectWallet = useCallback(() => {
    stacksDisconnect()
    setWallet({ connected: false, address: null, stxAddress: null })
  }, [])

  return {
    connected: wallet.connected,
    address: wallet.address,
    stxAddress: wallet.stxAddress,
    connect: connectWallet,
    disconnect: disconnectWallet,
  }
}
