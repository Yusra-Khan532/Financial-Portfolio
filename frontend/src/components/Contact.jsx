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
  const [validationError, setValidationError] = useState("");
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  const submit = async (event) => {
    event.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      setValidationError("Please enter your name and email address.");
      toast.error("Please fill in your name and email.");
      return;
    }
    setValidationError("");
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

  const inputClass = "contact-input w-full border px-3.5 text-base transition-colors focus:outline-none";

  return (
    <section id="contact" className="contact-section relative scroll-mt-24 px-5 py-10 md:px-6 md:py-16 lg:px-8">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-8 lg:grid-cols-[45fr_55fr] lg:gap-12">
        <Reveal>
          <div className="contact-introduction">
            <div className="contact-eyebrow text-xs font-medium uppercase tracking-[0.16em]">Get In Touch</div>
            <h2 className="contact-heading mt-3 max-w-[34rem] font-serif-display text-[clamp(1.75rem,4vw,2.5rem)] font-normal leading-[1.2]">Let&apos;s talk about your portfolio</h2>
            <p className="contact-copy mt-4 max-w-[460px] text-base leading-[1.65]">Reviewing your portfolio or exploring where to start? Tell us about your goals and the questions you&apos;d like to discuss.</p>
            <div className="mt-7 space-y-4">
            <a href={`mailto:${CONTACT_EMAIL}`} data-testid="contact-email-link" className="contact-link flex min-w-0 items-center gap-3 transition-colors">
              <Mail className="contact-link-icon shrink-0" size={20} strokeWidth={1.6} /><span className="break-words">{CONTACT_EMAIL}</span>
            </a>
            <a href={LINKEDIN_URL} target="_blank" rel="noreferrer" data-testid="contact-linkedin-link" className="contact-link flex items-center gap-3 transition-colors">
              <Linkedin className="contact-link-icon shrink-0" size={20} strokeWidth={1.6} /><span>LinkedIn</span>
            </a>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <form data-testid="contact-form" onSubmit={submit} className="contact-form-panel space-y-5 rounded-xl border p-5 md:p-8" noValidate>
            {validationError && <div id="contact-form-error" className="contact-form-error" role="alert">{validationError}</div>}
            <div className="contact-field">
              <label htmlFor="contact-name" className="contact-label">Full name <span aria-hidden="true">*</span></label>
              <input id="contact-name" data-testid="contact-name" required aria-required="true" aria-describedby={validationError ? "contact-form-error" : undefined} autoComplete="name" className={inputClass} placeholder="Your full name" value={form.name} onChange={set("name")} />
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="contact-field">
                <label htmlFor="contact-email" className="contact-label">Email address <span aria-hidden="true">*</span></label>
                <input id="contact-email" data-testid="contact-email" required aria-required="true" aria-describedby={validationError ? "contact-form-error" : undefined} type="email" autoComplete="email" className={inputClass} placeholder="you@example.com" value={form.email} onChange={set("email")} />
              </div>
              <div className="contact-field">
                <label htmlFor="contact-phone" className="contact-label">Phone number <span className="contact-optional">(optional)</span></label>
                <input id="contact-phone" data-testid="contact-phone" type="tel" autoComplete="tel" className={inputClass} placeholder="Your phone number" value={form.phone} onChange={set("phone")} />
              </div>
            </div>
            <fieldset className="contact-fieldset">
              <legend className="contact-label">Investment size <span className="contact-optional">(optional)</span></legend>
              <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                {sizes.map((size) => (
                  <label key={size} data-testid={`contact-size-${size}`} className={`contact-size ${form.investment_size === size ? "is-selected" : ""}`}>
                    <input type="radio" name="investment_size" value={size} checked={form.investment_size === size} onChange={set("investment_size")} />
                    <span className="contact-size-indicator" aria-hidden="true" />
                    <span>{size}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="contact-field">
              <label htmlFor="contact-message" className="contact-label">Your goals</label>
              <textarea id="contact-message" data-testid="contact-message" rows={4} className={`${inputClass} contact-message`} placeholder="What would you like to discuss?" value={form.message} onChange={set("message")} />
            </div>
            <button type="submit" data-testid="contact-submit-button" disabled={loading} className="contact-submit inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg px-7 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60">
              {loading ? "Sending…" : "Send enquiry"}<Send size={16} strokeWidth={2} />
            </button>
          </form>
        </Reveal>
      </div>
    </section>
  );
}
