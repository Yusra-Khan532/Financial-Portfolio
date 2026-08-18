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
import AboutPage from "@/pages/AboutPage";
import WhatWeDoPage from "@/pages/WhatWeDoPage";
import BlogPage from "@/pages/BlogPage";
import BlogDetailPage from "@/pages/BlogDetailPage";
import BlogAdminLoginPage from "@/pages/BlogAdminLoginPage";
import BlogAdminPage from "@/pages/BlogAdminPage";
import BlogAdminNewPage from "@/pages/BlogAdminNewPage";
import BlogAdminEditPage from "@/pages/BlogAdminEditPage";
import BlogAdminPreviewPage from "@/pages/BlogAdminPreviewPage";
import AdminRoute from "@/components/cms/AdminRoute";
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
            <Route path="/what-we-do" element={<WhatWeDoPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/portfolio" element={<PortfolioPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/blog" element={<BlogPage />} />
            <Route path="/blog/admin/login" element={<BlogAdminLoginPage />} />
            <Route element={<AdminRoute />}>
              <Route path="/blog/admin" element={<BlogAdminPage />} />
              <Route path="/blog/admin/new" element={<BlogAdminNewPage />} />
              <Route path="/blog/admin/edit/:id" element={<BlogAdminEditPage />} />
              <Route path="/blog/admin/preview/:id" element={<BlogAdminPreviewPage />} />
            </Route>
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
