import "@/App.css";
import { ReactLenis } from "lenis/react";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Performance from "@/components/Performance";
import Allocation from "@/components/Allocation";
import Holdings from "@/components/Holdings";
import Process from "@/components/Process";
import Services from "@/components/Services";
import Philosophy from "@/components/Philosophy";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";
import { Toaster } from "@/components/ui/sonner";

function App() {
  return (
    <ReactLenis root options={{ lerp: 0.09, smoothWheel: true }}>
      <div className="App relative bg-[#050E1D] min-h-screen overflow-x-hidden">
        <Navbar />
        <main>
          <Hero />
          <Performance />
          <Allocation />
          <Holdings />
          <Process />
          <Services />
          <Philosophy />
          <Contact />
        </main>
        <Footer />
        <Toaster position="top-center" theme="dark" />
      </div>
    </ReactLenis>
  );
}

export default App;
