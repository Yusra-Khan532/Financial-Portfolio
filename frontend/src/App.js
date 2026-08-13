import "@/App.css";
import { useEffect } from "react";
import { ReactLenis, useLenis } from "lenis/react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import Navbar from "@/components/Navbar";
import MarketTicker from "@/components/MarketTicker";
import Footer from "@/components/Footer";
import Home from "@/pages/Home";
import ContactPage from "@/pages/ContactPage";
import ServicesPage from "@/pages/ServicesPage";
import PortfolioPage from "@/pages/PortfolioPage";
import BlogPage from "@/pages/BlogPage";
import BlogDetailPage from "@/pages/BlogDetailPage";
import BlogAdminLoginPage from "@/pages/BlogAdminLoginPage";
import BlogAdminPage from "@/pages/BlogAdminPage";
import { Toaster } from "@/components/ui/sonner";

function ScrollManager() {
  const location = useLocation();
  const lenis = useLenis();
  useEffect(() => {
    if (lenis) lenis.scrollTo(0, { immediate: true });
    else window.scrollTo(0, 0);
  }, [location.pathname, lenis]);
  return null;
}

function App() {
  return (
    <ReactLenis root options={{ lerp: 0.09, smoothWheel: true }}>
      <BrowserRouter>
        <div className="App relative bg-[#050E1D] min-h-screen overflow-x-hidden">
          <ScrollManager />
          <MarketTicker />
          <Navbar />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/services" element={<ServicesPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/portfolio" element={<PortfolioPage />} />
            <Route path="/blog" element={<BlogPage />} />
            <Route path="/blog/admin/login" element={<BlogAdminLoginPage />} />
            <Route path="/blog/admin" element={<BlogAdminPage />} />
            <Route path="/blog/:slug" element={<BlogDetailPage />} />
          </Routes>
          <Footer />
          <Toaster position="top-center" theme="dark" />
        </div>
      </BrowserRouter>
    </ReactLenis>
  );
}

export default App;
