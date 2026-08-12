import { useState } from "react";
import axios from "axios";
import { motion } from "framer-motion";
import { ArrowRight, ArrowUpRight, CheckCircle2 } from "lucide-react";
import { useLenis } from "lenis/react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SERVICES = [
  { n: "01", name: "Portfolio Review", desc: "A structured discussion around an existing portfolio, its composition, diversification and underlying investment rationale." },
  { n: "02", name: "Stock Selection", desc: "A research-led discussion around evaluating individual businesses, fundamentals, valuation and investment considerations." },
  { n: "03", name: "Mutual Fund Investment Discussion", desc: "A discussion around mutual fund categories, portfolio fit, diversification and evaluating fund choices." },
  { n: "04", name: "Global Investing Discussion", desc: "A discussion around international investing, global market exposure and evaluating opportunities outside India." },
  { n: "05", name: "Exchange Traded Fund Discussion", desc: "A discussion around ETFs, index exposure, asset allocation and evaluating different ETF categories." },
  { n: "06", name: "General Investing Discussion", desc: "For broader investing questions, market concepts, portfolio thinking and investment frameworks." },
  { n: "07", name: "0 → 1 Investing", desc: "A foundational discussion for someone starting their investing journey — basic concepts, research mindset, portfolio thinking and how to approach investing systematically." },
];
const SERVICE_NAMES = SERVICES.map((s) => s.name);

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const empty = { name: "", email: "", phone: "", services: [], message: "" };

function validate(form) {
  const e = {};
  const name = form.name.trim();
  const letters = (name.match(/[A-Za-z]/g) || []).length;
  if (!name) e.name = "Please enter your name.";
  else if (name.length < 2 || letters < 2) e.name = "Please enter a valid name.";

  const email = form.email.trim();
  if (!email) e.email = "Please enter your email address.";
  else if (!emailRe.test(email)) e.email = "Please enter a valid email address.";

  const phone = form.phone.trim();
  const digits = (phone.match(/\d/g) || []).length;
  if (!phone) e.phone = "Please enter your mobile number.";
  else if (!/^\+?[\d\s\-()]+$/.test(phone) || digits < 7 || digits > 15) e.phone = "Please enter a valid mobile number.";

  if (!form.services.length) e.services = "Select at least one service.";

  const message = form.message.trim();
  if (!message) e.message = "Please enter a message.";
  else if (message.length < 10) e.message = "Message should be at least 10 characters.";
  return e;
}

export default function ServicesPage() {
  const lenis = useLenis();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState(false);

  const openForm = (serviceName) => {
    setForm({ ...empty, services: serviceName ? [serviceName] : [] });
    setErrors({});
    setTouched(false);
    setSent(false);
    setFailed(false);
    setOpen(true);
  };

  const set = (k) => (e) => {
    const next = { ...form, [k]: e.target.value };
    setForm(next);
    if (touched) setErrors(validate(next));
  };

  const toggleService = (name) => {
    const next = {
      ...form,
      services: form.services.includes(name)
        ? form.services.filter((s) => s !== name)
        : [...form.services, name],
    };
    setForm(next);
    if (touched) setErrors(validate(next));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setTouched(true);
    const eMap = validate(form);
    setErrors(eMap);
    if (Object.keys(eMap).length) return;
    setLoading(true);
    setFailed(false);
    try {
      await axios.post(`${API}/service-enquiry`, {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        services: form.services,
        message: form.message.trim(),
      });
      setSent(true);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setFailed(typeof detail === "string" ? detail : true);
    } finally {
      setLoading(false);
    }
  };

  const fieldCls = (err) =>
    `w-full bg-transparent border-b py-3 text-white placeholder:text-[#5A6B85] focus:outline-none transition-colors ${
      err ? "border-[#F87171]" : "border-white/15 focus:border-[#F5A623]"
    }`;
  const Label = ({ children }) => (
    <span className="block text-[11px] uppercase tracking-[0.2em] text-[#64748B] mb-2">{children}</span>
  );
  const Err = ({ id, msg }) =>
    msg ? <p data-testid={`enquiry-error-${id}`} className="mt-2 text-xs text-[#F87171]">{msg}</p> : null;

  return (
    <main className="relative min-h-screen px-6 md:px-10 pt-28 md:pt-32 pb-24">
      <div className="max-w-7xl mx-auto">
        {/* Hero */}
        <div className="max-w-3xl">
          <div className="flex items-center gap-3 mb-5">
            <span className="uppercase tracking-[0.28em] text-[11px] text-[#F5A623]">Services</span>
            <span className="h-px w-8 bg-[#F5A623]/50" />
          </div>
          <h1 className="font-serif-display text-4xl sm:text-5xl lg:text-6xl text-white tracking-tight leading-[1.05]">
            Thoughtful investing conversations, grounded in research.
          </h1>
          <p className="mt-6 text-base md:text-lg text-[#94A3B8] leading-relaxed max-w-xl">
            Connect with Nishant across a range of investing topics — from reviewing an
            existing portfolio to getting started from scratch. Choose what you'd like to
            discuss and share a few details.
          </p>
          <button
            data-testid="services-explore"
            onClick={() => lenis?.scrollTo("#service-grid", { offset: -80 })}
            className="mt-8 inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-[#F5A623] text-[#050E1D] font-medium hover:bg-[#E19212] transition-colors"
          >
            Explore Services <ArrowRight size={18} />
          </button>
        </div>

        {/* Service grid */}
        <div id="service-grid" className="mt-16 md:mt-20 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          {SERVICES.map((s, i) => (
            <motion.button
              key={s.name}
              data-testid={`service-card-${i}`}
              onClick={() => openForm(s.name)}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: (i % 3) * 0.05 }}
              className="group text-left rounded-xl border border-white/10 bg-[#0A1E3F]/40 p-6 hover:border-[#F5A623]/40 transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F5A623]"
            >
              <span className="font-serif-display text-[#F5A623] text-lg">{s.n}</span>
              <h3 className="mt-3 text-white text-xl leading-snug group-hover:text-[#F5A623] transition-colors">
                {s.name}
              </h3>
              <p className="mt-3 text-sm text-[#94A3B8] leading-relaxed">{s.desc}</p>
              <span className="mt-5 inline-flex items-center gap-1.5 text-sm text-[#F5A623]">
                Discuss this <ArrowUpRight size={15} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </span>
            </motion.button>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="mt-16 rounded-xl border border-white/10 bg-[#0A1E3F]/40 px-7 md:px-10 py-9 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="max-w-lg">
            <h3 className="font-serif-display text-2xl md:text-3xl text-white tracking-tight">
              Not sure which conversation fits?
            </h3>
            <p className="text-[#94A3B8] mt-2 text-sm md:text-base leading-relaxed">
              Start with a general investing discussion and share what you're looking for.
            </p>
          </div>
          <button
            data-testid="services-general-cta"
            onClick={() => openForm("General Investing Discussion")}
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-[#F5A623] text-[#050E1D] font-medium hover:bg-[#E19212] transition-colors self-start md:self-auto shrink-0"
          >
            Start a conversation <ArrowRight size={18} />
          </button>
        </div>
      </div>

      {/* Enquiry dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          data-testid="enquiry-dialog"
          className="bg-[#0A1E3F] border-white/10 text-white max-w-lg max-h-[90vh] overflow-y-auto"
        >
          {sent ? (
            <div data-testid="enquiry-success" className="py-4">
              <CheckCircle2 className="text-[#F5A623]" size={40} strokeWidth={1.5} />
              <h2 className="mt-5 font-serif-display text-2xl text-white">Enquiry received.</h2>
              <p className="mt-3 text-[#94A3B8] leading-relaxed">
                Thank you for reaching out. Nishant has received your details and can
                follow up using the contact information you provided.
              </p>
              <div className="mt-7 flex gap-3">
                <button
                  data-testid="enquiry-close"
                  onClick={() => setOpen(false)}
                  className="px-6 py-2.5 rounded-full bg-[#F5A623] text-[#050E1D] text-sm font-medium hover:bg-[#E19212] transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={() => setSent(false)}
                  className="px-6 py-2.5 rounded-full border border-white/20 text-white text-sm hover:border-[#F5A623] transition-colors"
                >
                  Back to Services
                </button>
              </div>
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="font-serif-display text-2xl">Service enquiry</DialogTitle>
                <DialogDescription className="text-[#94A3B8]">
                  Tell Nishant which areas you'd like to discuss.
                </DialogDescription>
              </DialogHeader>

              <form data-testid="enquiry-form" onSubmit={submit} noValidate className="mt-2 space-y-6">
                <div>
                  <Label>Full Name *</Label>
                  <input data-testid="enquiry-name" className={fieldCls(errors.name)} placeholder="Your full name" value={form.name} onChange={set("name")} />
                  <Err id="name" msg={errors.name} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <Label>Email Address *</Label>
                    <input data-testid="enquiry-email" type="email" className={fieldCls(errors.email)} placeholder="you@example.com" value={form.email} onChange={set("email")} />
                    <Err id="email" msg={errors.email} />
                  </div>
                  <div>
                    <Label>Mobile Number *</Label>
                    <input data-testid="enquiry-phone" className={fieldCls(errors.phone)} placeholder="+91 98765 43210" value={form.phone} onChange={set("phone")} />
                    <Err id="phone" msg={errors.phone} />
                  </div>
                </div>

                <div>
                  <Label>Services I'm interested in *</Label>
                  <div className="flex flex-wrap gap-2">
                    {SERVICE_NAMES.map((name) => {
                      const active = form.services.includes(name);
                      return (
                        <button
                          type="button"
                          key={name}
                          data-testid={`enquiry-chip-${name}`}
                          aria-pressed={active}
                          onClick={() => toggleService(name)}
                          className={`text-xs rounded-full px-3.5 py-2 border transition-colors ${
                            active
                              ? "bg-[#F5A623] text-[#050E1D] border-[#F5A623]"
                              : "border-white/20 text-[#94A3B8] hover:border-[#F5A623]"
                          }`}
                        >
                          {name}
                        </button>
                      );
                    })}
                  </div>
                  <Err id="services" msg={errors.services} />
                </div>

                <div>
                  <Label>Message *</Label>
                  <textarea data-testid="enquiry-message" rows={3} className={fieldCls(errors.message)} placeholder="Tell Nishant briefly what you'd like to discuss..." value={form.message} onChange={set("message")} />
                  <Err id="message" msg={errors.message} />
                </div>

                {failed && (
                  <p data-testid="enquiry-send-error" className="text-sm text-[#F87171]">
                    {typeof failed === "string" ? failed : "Something went wrong. Please try again."}
                  </p>
                )}

                <button
                  type="submit"
                  data-testid="enquiry-submit"
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-7 py-3 rounded-full bg-[#F5A623] text-[#050E1D] font-medium hover:bg-[#E19212] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? "Sending..." : "Send Enquiry"}
                  {!loading && <ArrowRight size={16} />}
                </button>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
