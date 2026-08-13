import { Link, useNavigate } from "react-router-dom";
import { clearCmsToken } from "@/lib/cms";

export default function AdminShell({ children, compact = false }) {
  const navigate = useNavigate();
  const signOut = () => {
    clearCmsToken();
    navigate("/blog/admin/login", { replace: true });
  };

  return (
    <main className="pt-24 md:pt-28 px-5 md:px-10 py-10 md:py-14 min-h-[70vh]">
      <div className={compact ? "max-w-5xl mx-auto" : "max-w-7xl mx-auto"}>
        <div className="flex items-center justify-between gap-4 pb-5 border-b border-white/10">
          <Link to="/blog/admin" className="text-[11px] uppercase tracking-[.22em] text-[#E7C56B] hover:text-[#F5A623]">
            Research CMS
          </Link>
          <div className="flex items-center gap-5 text-xs">
            <Link to="/blog" className="text-[#71839A] hover:text-white">View public blog</Link>
            <button onClick={signOut} className="text-[#71839A] hover:text-white">Sign out</button>
          </div>
        </div>
        {children}
      </div>
    </main>
  );
}
