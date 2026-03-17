import { BrowserRouter, Routes, Route } from "react-router-dom"
import { Layout } from "@/components/Layout"
import { ExplorePage } from "@/pages/ExplorePage"
import { CreatePage } from "@/pages/CreatePage"
import { TokenPage } from "@/pages/TokenPage"
import { Toaster } from "@/components/ui/sonner"
import "./App.css"

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<ExplorePage />} />
          <Route path="/create" element={<CreatePage />} />
          <Route path="/token/:address" element={<TokenPage />} />
        </Route>
      </Routes>
      <Toaster />
    </BrowserRouter>
  )
}

export default App
