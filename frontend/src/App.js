import "@/App.css";
import { useEffect } from "react";
import { ReactLenis, useLenis } from "lenis/react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Home from "@/pages/Home";
import ContactPage from "@/pages/ContactPage";
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
          <Navbar />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/contact" element={<ContactPage />} />
          </Routes>
          <Footer />
          <Toaster position="top-center" theme="dark" />
        </div>
      </BrowserRouter>
    </ReactLenis>
  );
}

export default App;
