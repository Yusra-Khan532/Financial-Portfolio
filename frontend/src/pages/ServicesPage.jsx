import { useState } from "react";
import axios from "axios";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const SERVICES = [
  { n: "01", name: "Portfolio Review", proposition: "Make your portfolio work harder.", desc: "Get a clear review of your holdings, diversification, risk and overall portfolio structure." },
  { n: "02", name: "Stock Selection", proposition: "Find stocks with a reason, not a hunch.", desc: "Discuss businesses, valuations, growth potential and key risks before investing." },
  { n: "03", name: "Mutual Fund Investment", proposition: "Choose funds that fit your goals.", desc: "Understand fund categories, performance, risk and how to build a suitable mutual fund portfolio." },
  { n: "04", name: "Global Investing", proposition: "Look beyond your home market.", desc: "Explore opportunities across global markets while understanding currency, country and investment risks." },
  { n: "05", name: "ETF Discussion", proposition: "Diversify simply with ETFs.", desc: "Learn how ETFs work, what they track and when they can make sense for your portfolio." },
  { n: "06", name: "General Investing", proposition: "Have an investing question? Start here.", desc: "Discuss strategies, market concepts, asset allocation and other questions related to the investing journey." },
  { n: "07", name: "0 → 1 Investing", proposition: "Start investing from zero, with confidence.", desc: "Go from understanding the basics to making your first informed investment — step by step.", beginner: true },
];
const PRICING = [
  { plan: "First Session", price: "₹99" },
  { plan: "1 Month", price: "₹299" },
  { plan: "3 Months", price: "₹699" },
  { plan: "6 Months", price: "₹1,299" },
  { plan: "1 Year", price: "₹2,499" },
];
const SERVICE_NAMES = SERVICES.map((service) => service.name);
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const empty = { name: "", email: "", phone: "", services: [], message: "" };

function validate(form) {
  const errors = {};
  const letters = (form.name.match(/[A-Za-z]/g) || []).length;
  if (!form.name.trim()) errors.name = "Please enter your name.";
  else if (form.name.trim().length < 2 || letters < 2) errors.name = "Please enter a valid name.";
  if (!form.email.trim()) errors.email = "Please enter your email address.";
  else if (!emailRe.test(form.email.trim())) errors.email = "Please enter a valid email address.";
  const digits = (form.phone.match(/\d/g) || []).length;
  if (!form.phone.trim()) errors.phone = "Please enter your mobile number.";
  else if (!/^\+?[\d\s\-()]+$/.test(form.phone) || digits < 7 || digits > 15) errors.phone = "Please enter a valid mobile number.";
  if (!form.services.length) errors.services = "Select at least one service.";
  if (form.message.trim() && form.message.trim().length < 10) errors.message = "Message should be at least 10 characters.";
  return errors;
}

export default function ServicesPage() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState(false);
  const openForm = (service) => { setForm({ ...empty, services: service ? [service] : [] }); setErrors({}); setTouched(false); setSent(false); setFailed(false); setOpen(true); };
  const set = (key) => (event) => { const next = { ...form, [key]: event.target.value }; setForm(next); if (touched) setErrors(validate(next)); };
  const toggleService = (service) => { const next = { ...form, services: form.services.includes(service) ? form.services.filter((item) => item !== service) : [...form.services, service] }; setForm(next); if (touched) setErrors(validate(next)); };
  const submit = async (event) => {
    event.preventDefault(); if (loading) return; setTouched(true);
    const nextErrors = validate(form); setErrors(nextErrors); if (Object.keys(nextErrors).length) return;
    setLoading(true); setFailed(false);
    try { await axios.post(`${API}/service-enquiry`, { name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(), services: form.services, message: form.message.trim() }); setSent(true); }
    catch (error) { const detail = error?.response?.data?.detail; setFailed(typeof detail === "string" ? detail : true); }
    finally { setLoading(false); }
  };
  const fieldClass = (error) => `w-full border-b bg-transparent py-3 text-white placeholder:text-[#5A6B85] transition-colors focus:outline-none ${error ? "border-[#F87171]" : "border-white/15 focus:border-[#F5A623]"}`;
  const Label = ({ children }) => <span className="mb-2 block text-[11px] uppercase tracking-[0.2em] text-[#64748B]">{children}</span>;
  const ErrorText = ({ id, message }) => message ? <p data-testid={`enquiry-error-${id}`} className="mt-2 text-xs text-[#F87171]">{message}</p> : null;

  return (
    <main className="min-h-screen px-6 pb-16 pt-28 md:px-10 md:pb-20 md:pt-32">
      <div className="mx-auto max-w-7xl">
        <header className="max-w-3xl">
          <div className="mb-5 flex items-center gap-3"><span className="text-[11px] uppercase tracking-[0.28em] text-[#F5A623]">Services</span><span className="h-px w-8 bg-[#F5A623]/50" /></div>
          <h1 className="font-serif-display text-4xl leading-[1.04] tracking-tight text-white sm:text-5xl lg:text-6xl">Research and discussion for better investment decisions.</h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-[#94A3B8] md:text-lg">Explore portfolio reviews, Indian and global investing, mutual funds, ETFs and investing fundamentals — with a research-led approach.</p>
        </header>

        <section className="mt-12 md:mt-14" aria-label="FinLit services">
          <div className="grid gap-5 lg:grid-cols-2 lg:gap-6">
            {SERVICES.map((service, index) => <motion.article key={service.name} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-50px" }} transition={{ duration: 0.5, delay: (index % 2) * 0.06 }} className="group flex min-h-[304px] rounded-xl border border-white/10 bg-[#07182F]/50 p-7 transition-colors duration-300 hover:border-[#D4AF37]/45 hover:bg-[#0A1E3F]/58 md:p-8">
              <div className="flex w-full gap-5"><span className="pt-1 font-serif-display text-lg text-[#F5A623]">{service.n}</span><div className="flex min-w-0 flex-1 flex-col"><h2 className="font-serif-display text-3xl leading-tight text-white">{service.name}</h2><p className="mt-4 text-[15px] font-semibold text-[#E2E8F0]">{service.proposition}</p><p className="mt-3 max-w-md text-sm leading-relaxed text-[#94A3B8]">{service.desc}</p><button onClick={() => openForm(service.name)} className="mt-auto inline-flex w-fit items-center gap-2 rounded-full bg-[#F5A623] px-5 py-2 text-sm font-medium text-[#050E1D] transition-colors hover:bg-[#E19212] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F5A623] focus-visible:ring-offset-2 focus-visible:ring-offset-[#07182F]">Discuss this <span aria-hidden="true">→</span></button></div></div>
            </motion.article>)}
          </div>
        </section>

        <section className="mt-20 border-t border-white/10 pt-14 md:mt-24 md:pt-16" aria-labelledby="engagement-heading">
          <div className="grid gap-9 lg:grid-cols-[.82fr_1.18fr] lg:gap-20">
            <div className="max-w-xl"><div className="text-[11px] uppercase tracking-[0.28em] text-[#F5A623]">Engagement Options</div><h2 id="engagement-heading" className="mt-5 font-serif-display text-4xl leading-tight text-white sm:text-5xl">Choose how you want to engage.</h2><p className="mt-5 leading-relaxed text-[#94A3B8]">Start with a single discussion or continue over a longer period depending on the level of support you need.</p></div>
            <div className="border-t border-white/10"><p className="px-1 pt-4 text-xs text-[#94A3B8]">Prices are per service.</p>{PRICING.map((item) => <div key={item.plan} className="group flex items-center justify-between gap-6 border-b border-white/10 px-1 py-5 transition-colors hover:border-white/20"><span className="font-serif-display text-2xl text-[#E2E8F0] transition-colors group-hover:text-white">{item.plan}</span><span className="font-serif-display text-3xl font-medium tabular-nums text-[#E2E8F0] transition-colors group-hover:text-[#E7C56B]">{item.price}</span></div>)}</div>
          </div>
        </section>

      </div>

      <Dialog open={open} onOpenChange={setOpen}><DialogContent data-testid="enquiry-dialog" className="max-h-[90vh] max-w-lg overflow-y-auto border-white/10 bg-[#0A1E3F] text-white">
        {sent ? <div data-testid="enquiry-success" className="py-4"><CheckCircle2 className="text-[#F5A623]" size={40} strokeWidth={1.5} /><h2 className="mt-5 font-serif-display text-2xl text-white">Enquiry received.</h2><p className="mt-3 leading-relaxed text-[#94A3B8]">Thank you for reaching out. FinLit has received your details and will follow up using the contact information you provided.</p><div className="mt-7 flex gap-3"><button data-testid="enquiry-close" onClick={() => setOpen(false)} className="rounded-full bg-[#F5A623] px-6 py-2.5 text-sm font-medium text-[#050E1D] transition-colors hover:bg-[#E19212]">Close</button><button onClick={() => setSent(false)} className="rounded-full border border-white/20 px-6 py-2.5 text-sm text-white transition-colors hover:border-[#F5A623]">Back to Services</button></div></div> : <><DialogHeader><DialogTitle className="font-serif-display text-2xl">Start a discussion</DialogTitle><DialogDescription className="text-[#94A3B8]">Tell us which areas you&apos;d like to discuss.</DialogDescription></DialogHeader><form data-testid="enquiry-form" onSubmit={submit} noValidate className="mt-2 space-y-6"><div><Label>Full Name *</Label><input data-testid="enquiry-name" className={fieldClass(errors.name)} placeholder="Your full name" value={form.name} onChange={set("name")} /><ErrorText id="name" message={errors.name} /></div><div className="grid grid-cols-1 gap-6 sm:grid-cols-2"><div><Label>Email Address *</Label><input data-testid="enquiry-email" type="email" className={fieldClass(errors.email)} placeholder="you@example.com" value={form.email} onChange={set("email")} /><ErrorText id="email" message={errors.email} /></div><div><Label>Mobile Number *</Label><input data-testid="enquiry-phone" className={fieldClass(errors.phone)} placeholder="+91 98765 43210" value={form.phone} onChange={set("phone")} /><ErrorText id="phone" message={errors.phone} /></div></div><div><Label>Services I&apos;m interested in *</Label><div className="flex flex-wrap gap-2">{SERVICE_NAMES.map((service) => { const active = form.services.includes(service); return <button type="button" key={service} data-testid={`enquiry-chip-${service}`} aria-pressed={active} onClick={() => toggleService(service)} className={`rounded-full border px-3.5 py-2 text-xs transition-colors ${active ? "border-[#F5A623] bg-[#F5A623] text-[#050E1D]" : "border-white/20 text-[#94A3B8] hover:border-[#F5A623]"}`}>{service}</button>; })}</div><ErrorText id="services" message={errors.services} /></div><div><Label>Message</Label><textarea data-testid="enquiry-message" rows={3} className={fieldClass(errors.message)} placeholder="Tell us briefly what you&apos;d like to discuss..." value={form.message} onChange={set("message")} /><ErrorText id="message" message={errors.message} /></div>{failed && <p data-testid="enquiry-send-error" className="text-sm text-[#F87171]">{typeof failed === "string" ? failed : "Something went wrong. Please try again."}</p>}<button type="submit" data-testid="enquiry-submit" disabled={loading} className="inline-flex items-center gap-2 rounded-full bg-[#F5A623] px-7 py-3 font-medium text-[#050E1D] transition-colors hover:bg-[#E19212] disabled:cursor-not-allowed disabled:opacity-60">{loading ? "Sending..." : "Send Enquiry"}{!loading && <ArrowRight size={16} />}</button></form></>}</DialogContent></Dialog>
    </main>
  );
}
