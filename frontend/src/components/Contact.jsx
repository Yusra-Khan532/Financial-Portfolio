import { useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Reveal, SectionLabel } from "@/components/Reveal";
import { Mail, Send } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const sizes = ["Under ₹25L", "₹25L – ₹1 Cr", "₹1 Cr – ₹5 Cr", "₹5 Cr +"];

export default function Contact() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", investment_size: "", message: "" });
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      toast.error("Please fill in your name, email and message.");
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${API}/contact`, form);
      toast.success("Message sent. Nishant will be in touch shortly.");
      setForm({ name: "", email: "", phone: "", investment_size: "", message: "" });
    } catch (err) {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    "w-full bg-transparent border-b border-white/20 py-3 text-white placeholder:text-[#64748B] focus:border-[#F5A623] focus:outline-none transition-colors";

  return (
    <section id="contact" className="relative py-24 md:py-32 px-6 md:px-10">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16">
        <Reveal>
          <SectionLabel index="06">Get In Touch</SectionLabel>
          <h2 className="font-serif-display text-4xl sm:text-5xl lg:text-6xl text-white tracking-tight">
            Let's build a portfolio that compounds.
          </h2>
          <p className="text-[#94A3B8] mt-6 max-w-md leading-relaxed">
            Tell me about your goals and current holdings. I'll respond with how
            we can work together — whether that's discretionary management,
            research advisory, or a one-off portfolio review.
          </p>
          <a
            href="mailto:invest@nishantjain.in"
            data-testid="contact-email-link"
            className="inline-flex items-center gap-3 mt-8 text-white hover:text-[#F5A623] transition-colors"
          >
            <span className="h-10 w-10 rounded-full border border-white/20 flex items-center justify-center">
              <Mail size={16} strokeWidth={1.5} />
            </span>
            invest@nishantjain.in
          </a>
        </Reveal>

        <Reveal delay={0.1}>
          <form data-testid="contact-form" onSubmit={submit} className="space-y-6">
            <input data-testid="contact-name" className={inputCls} placeholder="Full name" value={form.name} onChange={set("name")} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <input data-testid="contact-email" type="email" className={inputCls} placeholder="Email address" value={form.email} onChange={set("email")} />
              <input data-testid="contact-phone" className={inputCls} placeholder="Phone (optional)" value={form.phone} onChange={set("phone")} />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-[#64748B]">Investment size</label>
              <div className="flex flex-wrap gap-2 mt-3">
                {sizes.map((s) => (
                  <button
                    type="button"
                    key={s}
                    data-testid={`contact-size-${s}`}
                    onClick={() => setForm({ ...form, investment_size: s })}
                    className={`text-sm rounded-full px-4 py-2 border transition-colors ${
                      form.investment_size === s
                        ? "bg-[#F5A623] text-[#050E1D] border-[#F5A623]"
                        : "border-white/20 text-[#94A3B8] hover:border-[#F5A623]"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <textarea data-testid="contact-message" rows={4} className={inputCls} placeholder="Tell me about your goals..." value={form.message} onChange={set("message")} />
            <button
              type="submit"
              data-testid="contact-submit-button"
              disabled={loading}
              className="inline-flex items-center gap-2 px-8 py-3 rounded-full bg-[#F5A623] text-[#050E1D] font-medium hover:bg-[#E19212] transition-colors disabled:opacity-60"
            >
              {loading ? "Sending..." : "Send message"}
              <Send size={16} strokeWidth={2} />
            </button>
          </form>
        </Reveal>
      </div>
    </section>
  );
}
