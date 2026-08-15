import { useState } from "react";
import axios from "axios";
import { motion } from "framer-motion";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { CONTACT_EMAIL, LINKEDIN_URL } from "@/config";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(form) {
  const e = {};
  const name = form.name.trim();
  const letters = (name.match(/[A-Za-z]/g) || []).length;
  if (!name) e.name = "Please enter your name.";
  else if (name.length < 2 || letters < 2) e.name = "Please enter a valid name.";

  const email = form.email.trim();
  if (!email) e.email = "Please enter your email address.";
  else if (!emailRe.test(email)) e.email = "Please enter a valid email address.";

  const mobile = form.mobile.trim();
  if (mobile) {
    const digits = (mobile.match(/\d/g) || []).length;
    if (!/^\+?[\d\s\-()]+$/.test(mobile) || digits < 7 || digits > 15)
      e.mobile = "Please enter a valid mobile number.";
  }

  return e;
}

const empty = { name: "", email: "", mobile: "", subject: "", message: "" };

export default function ContactPage() {
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState(false);

  const set = (k) => (e) => {
    const next = { ...form, [k]: e.target.value };
    setForm(next);
    if (touched) setErrors(validate(next));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (loading) return; // prevent duplicate submissions
    setTouched(true);
    const eMap = validate(form);
    setErrors(eMap);
    if (Object.keys(eMap).length) return;

    setLoading(true);
    setFailed(false);
    try {
      await axios.post(`${API}/contact`, {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.mobile.trim() || null,
        subject: form.subject.trim() || null,
        message: form.message.trim(),
      });
      setSent(true);
      setForm(empty);
      setTouched(false);
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
    <span className="block text-[11px] uppercase tracking-[0.22em] text-[#64748B] mb-2">{children}</span>
  );
  const Err = ({ id, msg }) =>
    msg ? (
      <p data-testid={`contactpage-error-${id}`} className="mt-2 text-xs text-[#F87171]">
        {msg}
      </p>
    ) : null;

  return (
    <main className="relative min-h-screen px-6 md:px-10 pt-32 pb-24">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-14 lg:gap-20">
        {/* Left — intro */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="lg:col-span-5"
        >
          <span className="uppercase tracking-[0.35em] text-xs text-[#F5A623]">Contact</span>
          <h1 className="mt-5 font-serif-display text-4xl sm:text-5xl lg:text-6xl text-white tracking-tight leading-[0.98]">
            Get in Touch
          </h1>
          <p className="mt-6 text-[17px] text-[#94A3B8] leading-relaxed max-w-md">
            Have a question, want to discuss markets and research, or simply
            connect? Send a message and I&apos;ll get back to you.
          </p>

          <div className="mt-12 pt-8 border-t border-white/10">
            <span className="block text-[11px] uppercase tracking-[0.22em] text-[#64748B] mb-3">
              Prefer email?
            </span>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              data-testid="contactpage-email-link"
              className="text-white text-lg hover:text-[#F5A623] transition-colors"
            >
              {CONTACT_EMAIL}
            </a>
            {LINKEDIN_URL ? (
              <div className="mt-5">
                <a
                  href={LINKEDIN_URL}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="contactpage-linkedin-link"
                  className="text-sm text-[#94A3B8] hover:text-[#F5A623] transition-colors"
                >
                  LinkedIn →
                </a>
              </div>
            ) : null}
          </div>
        </motion.div>

        {/* Right — form / success */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="lg:col-span-7"
        >
          {sent ? (
            <div
              data-testid="contactpage-success"
              className="border border-white/10 rounded-lg p-10 bg-[#0A1E3F]/40"
            >
              <CheckCircle2 className="text-[#F5A623]" size={40} strokeWidth={1.5} />
              <h2 className="mt-5 font-serif-display text-3xl text-white">Message sent</h2>
              <p className="mt-3 text-[#94A3B8] max-w-md leading-relaxed">
                Thank you for reaching out. Your message has been delivered and
                I&apos;ll get back to you shortly.
              </p>
              <button
                data-testid="contactpage-send-another"
                onClick={() => setSent(false)}
                className="mt-8 inline-flex items-center gap-2 text-sm text-white hover:text-[#F5A623] transition-colors"
              >
                Send another message <ArrowRight size={16} />
              </button>
            </div>
          ) : (
            <form data-testid="contactpage-form" onSubmit={submit} noValidate className="space-y-8">
              <div>
                <Label>Full Name *</Label>
                <input
                  data-testid="contactpage-name"
                  className={fieldCls(errors.name)}
                  placeholder="Your full name"
                  value={form.name}
                  onChange={set("name")}
                />
                <Err id="name" msg={errors.name} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                <div>
                  <Label>Email Address *</Label>
                  <input
                    data-testid="contactpage-email"
                    className={fieldCls(errors.email)}
                    placeholder="you@example.com"
                    value={form.email}
                    onChange={set("email")}
                  />
                  <Err id="email" msg={errors.email} />
                </div>
                <div>
                  <Label>Mobile Number</Label>
                  <input
                    data-testid="contactpage-mobile"
                    className={fieldCls(errors.mobile)}
                    placeholder="+91 98765 43210"
                    value={form.mobile}
                    onChange={set("mobile")}
                  />
                  <Err id="mobile" msg={errors.mobile} />
                </div>
              </div>

              <div>
                <Label>Subject</Label>
                <input
                  data-testid="contactpage-subject"
                  className={fieldCls(false)}
                  placeholder="What is this regarding?"
                  value={form.subject}
                  onChange={set("subject")}
                />
              </div>

              <div>
                <Label>Message</Label>
                <textarea
                  data-testid="contactpage-message"
                  rows={5}
                  className={fieldCls(false)}
                  placeholder="Write your message..."
                  value={form.message}
                  onChange={set("message")}
                />
              </div>

              {failed && (
                <p data-testid="contactpage-send-error" className="text-sm text-[#F87171]">
                  {typeof failed === "string"
                    ? failed
                    : "Something went wrong while sending your message. Please try again."}
                </p>
              )}

              <button
                type="submit"
                data-testid="contactpage-submit"
                disabled={loading}
                className="inline-flex items-center gap-2 px-9 py-3.5 rounded-full bg-[#F5A623] text-[#050E1D] font-medium hover:bg-[#E19212] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? "Sending..." : "Send Message"}
                {!loading && <ArrowRight size={17} />}
              </button>
            </form>
          )}
        </motion.div>
      </div>
    </main>
  );
}
