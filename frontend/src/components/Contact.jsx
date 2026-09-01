import { useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Reveal } from "@/components/Reveal";
import { Linkedin, Mail, Send } from "lucide-react";
import { CONTACT_EMAIL, LINKEDIN_URL } from "@/config";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const sizes = ["Under INR 25L", "INR 25L – INR 1 Cr", "INR 1 Cr – INR 5 Cr", "INR 5 Cr+"];

export default function Contact() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", investment_size: "", message: "" });
  const [loading, setLoading] = useState(false);
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  const submit = async (event) => {
    event.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      toast.error("Please fill in your name and email.");
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${API}/contact`, form);
      toast.success("Message sent. FinLit will be in touch shortly.");
      setForm({ name: "", email: "", phone: "", investment_size: "", message: "" });
    } catch (error) {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full border-b border-white/15 bg-transparent py-3.5 text-white placeholder:text-[#64748B] transition-colors focus:border-[#F5A623] focus:outline-none";

  return (
    <section id="contact" className="relative px-6 py-20 md:px-10 md:py-24">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-14 lg:grid-cols-2 lg:gap-20">
        <Reveal>
          <div className="text-[11px] uppercase tracking-[0.28em] text-[#F5A623]">Get In Touch</div>
          <h2 className="mt-4 max-w-[34rem] font-serif-display text-3xl leading-[1.05] tracking-tight text-white sm:text-4xl lg:text-[2.8rem]">Let&apos;s talk about your portfolio</h2>
          <p className="mt-6 max-w-md leading-relaxed text-[#94A3B8]">Whether you&apos;re reviewing an existing portfolio, exploring Indian or global markets, or looking for a more research-led perspective, tell us what you&apos;re trying to achieve.</p>
          <div className="mt-9 space-y-3">
            <a href={`mailto:${CONTACT_EMAIL}`} data-testid="contact-email-link" className="inline-flex items-center gap-3 text-white transition-colors hover:text-[#F5A623]">
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15"><Mail size={16} strokeWidth={1.5} /></span>{CONTACT_EMAIL}
            </a>
            <a href={LINKEDIN_URL} target="_blank" rel="noreferrer" data-testid="contact-linkedin-link" className="flex items-center gap-3 text-[#94A3B8] transition-colors hover:text-[#F5A623]">
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15"><Linkedin size={15} strokeWidth={1.5} /></span>LinkedIn
            </a>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <form data-testid="contact-form" onSubmit={submit} className="space-y-7 pt-1">
            <input data-testid="contact-name" className={inputClass} placeholder="Full name" value={form.name} onChange={set("name")} />
            <div className="grid grid-cols-1 gap-7 sm:grid-cols-2">
              <input data-testid="contact-email" type="email" className={inputClass} placeholder="Email address" value={form.email} onChange={set("email")} />
              <input data-testid="contact-phone" className={inputClass} placeholder="Phone (optional)" value={form.phone} onChange={set("phone")} />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-[0.18em] text-[#64748B]">Investment size</label>
              <div className="mt-3 flex flex-wrap gap-2">
                {sizes.map((size) => <button type="button" key={size} data-testid={`contact-size-${size}`} onClick={() => setForm({ ...form, investment_size: size })} className={`rounded-full border px-4 py-2 text-sm transition-colors ${form.investment_size === size ? "border-[#F5A623] bg-[#F5A623] text-[#050E1D]" : "border-white/15 text-[#94A3B8] hover:border-[#F5A623] hover:text-[#CBD5E1]"}`}>{size}</button>)}
              </div>
            </div>
            <textarea data-testid="contact-message" rows={4} className={inputClass} placeholder="Tell us about your goals..." value={form.message} onChange={set("message")} />
            <button type="submit" data-testid="contact-submit-button" disabled={loading} className="mt-2 inline-flex items-center gap-2 rounded-full bg-[#F5A623] px-8 py-3.5 font-medium text-[#050E1D] transition-colors hover:bg-[#E19212] disabled:opacity-60">
              {loading ? "Sending..." : "Send message"}<Send size={16} strokeWidth={2} />
            </button>
          </form>
        </Reveal>
      </div>
    </section>
  );
}
