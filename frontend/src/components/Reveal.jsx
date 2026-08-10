import { motion } from "framer-motion";

export const Reveal = ({ children, delay = 0, y = 28, className = "" }) => (
  <motion.div
    className={className}
    initial={{ opacity: 0, y }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: "-80px" }}
    transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
  >
    {children}
  </motion.div>
);

export const SectionLabel = ({ index, children }) => (
  <div className="flex items-center gap-3 mb-5">
    <span className="font-serif-display text-[#F5A623] text-lg">{index}</span>
    <span className="h-px w-10 bg-[#F5A623]/50" />
    <span className="uppercase tracking-[0.25em] text-xs text-[#94A3B8]">
      {children}
    </span>
  </div>
);
