import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronRight, MessageCircle, RotateCcw, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { assistantNodes, MAIN_MENU_ID } from "./finlitAssistantData";
import "./FinLitAssistant.css";

export default function FinLitAssistant() {
  const navigate = useNavigate();
  const location = useLocation();
  const launcherRef = useRef(null);
  const closeRef = useRef(null);
  const conversationRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [nodeId, setNodeId] = useState(MAIN_MENU_ID);
  const [history, setHistory] = useState([]);

  const isAdmin = location.pathname.startsWith("/blog/admin");
  const node = assistantNodes[nodeId];

  useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    conversationRef.current?.scrollTo({ top: conversationRef.current.scrollHeight, behavior: "smooth" });
  }, [history, nodeId]);

  if (isAdmin) return null;

  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => launcherRef.current?.focus());
  };

  const mainMenu = () => {
    setHistory([]);
    setNodeId(MAIN_MENU_ID);
  };

  const goBack = () => {
    const previous = history[history.length - 1];
    if (!previous) return mainMenu();
    setHistory((entries) => entries.slice(0, -1));
    setNodeId(previous.from);
  };

  const handleOption = (option) => {
    const { action } = option;
    if (action.type === "menu") {
      setHistory((entries) => [...entries, { from: nodeId, user: option.label, answer: assistantNodes[action.target].answer }]);
      setNodeId(action.target);
      return;
    }

    if (action.type === "enquire") {
      navigate("/services", { state: { enquiryService: action.service } });
      close();
      return;
    }

    navigate(action.to);
    close();
  };

  return <div className="finlit-assistant">
    {open && <section className="finlit-assistant__panel" role="dialog" aria-modal="false" aria-labelledby="finlit-assistant-title">
      <header className="finlit-assistant__header">
        <div><h2 id="finlit-assistant-title">FinLit Assistant</h2><p>Guided website assistant</p></div>
        <button ref={closeRef} type="button" className="finlit-assistant__icon-button" onClick={close} aria-label="Close FinLit Assistant"><X size={18} /></button>
      </header>
      <div ref={conversationRef} className="finlit-assistant__conversation" aria-live="polite">
        <div className="finlit-assistant__message finlit-assistant__message--bot">{assistantNodes.main.greeting}</div>
        {history.map((entry, index) => <div key={`${entry.user}-${index}`} className="finlit-assistant__turn"><div className="finlit-assistant__message finlit-assistant__message--user">{entry.user}</div>{entry.answer && <div className="finlit-assistant__message finlit-assistant__message--bot">{entry.answer}</div>}</div>)}
        {nodeId === MAIN_MENU_ID && <p className="finlit-assistant__prompt">{node.prompt}</p>}
        <div className="finlit-assistant__options" aria-label="FinLit Assistant options">
          {node.options.map((option) => <button key={option.label} type="button" onClick={() => handleOption(option)}>{option.label}<ChevronRight size={15} aria-hidden="true" /></button>)}
        </div>
        {nodeId !== MAIN_MENU_ID && <div className="finlit-assistant__navigation"><button type="button" onClick={goBack}><ArrowLeft size={14} />{node.backLabel || "Back"}</button><button type="button" onClick={mainMenu}><RotateCcw size={13} />Main Menu</button></div>}
      </div>
      <footer className="finlit-assistant__footer">FinLit Assistant provides general information about our services and website. It does not provide personalized investment advice.</footer>
    </section>}
    <button ref={launcherRef} type="button" className="finlit-assistant__launcher" onClick={() => setOpen((value) => !value)} aria-label={open ? "Close FinLit Assistant" : "Open FinLit Assistant"} aria-expanded={open}>
      {open ? <X size={19} /> : <MessageCircle size={19} />}<span>Ask FinLit</span>
    </button>
  </div>;
}
