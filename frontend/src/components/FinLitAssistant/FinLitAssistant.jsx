import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronRight, MessageCircle, RotateCcw, Send, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { assistantNodes, MAIN_MENU_ID } from "./finlitAssistantData";
import AssistantMarkdown from "./AssistantMarkdown";
import "./FinLitAssistant.css";

export default function FinLitAssistant() {
  const navigate = useNavigate();
  const location = useLocation();
  const launcherRef = useRef(null);
  const closeRef = useRef(null);
  const conversationRef = useRef(null);
  const composerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [nodeId, setNodeId] = useState(MAIN_MENU_ID);
  const [history, setHistory] = useState([]);
  const [chatTurns, setChatTurns] = useState([]);
  const [message, setMessage] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");

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
  }, [history, nodeId, chatTurns, chatLoading]);

  if (isAdmin) return null;

  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => launcherRef.current?.focus());
  };

  const mainMenu = () => {
    setHistory([]);
    setNodeId(MAIN_MENU_ID);
    setChatTurns([]);
    setChatError("");
  };

  const sendMessage = async (event) => {
    event.preventDefault();
    const text = message.trim();
    if (!text || chatLoading) return;
    const previousTurns = chatTurns.filter((turn) => !turn.failed).slice(-12);
    setMessage("");
    setChatError("");
    setChatTurns((turns) => [...turns, { role: "user", content: text, pending: true }]);
    setChatLoading(true);
    try {
      const apiBase = `${process.env.REACT_APP_BACKEND_URL || ""}/api`;
      const response = await fetch(`${apiBase}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history: previousTurns }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "FinLit AI is temporarily unavailable. Please try again.");
      setChatTurns((turns) => [
        ...turns.slice(0, -1),
        { role: "user", content: text },
        { role: "assistant", content: data.response },
      ].slice(-24));
    } catch (error) {
      setChatTurns((turns) => [...turns.slice(0, -1), { role: "user", content: text, failed: true }]);
      setChatError(error.message || "We couldn’t reach FinLit AI. Check your connection and try again.");
    } finally {
      setChatLoading(false);
    }
  };

  const handleComposerKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      composerRef.current?.requestSubmit();
    }
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
        <div><h2 id="finlit-assistant-title">FinLit AI</h2><p>YOUR FINANCIAL COMPANION</p></div>
        <button ref={closeRef} type="button" className="finlit-assistant__icon-button" onClick={close} aria-label="Close FinLit Assistant"><X size={18} /></button>
      </header>
      <div ref={conversationRef} className="finlit-assistant__conversation" aria-live="polite">
        <div className="finlit-assistant__message finlit-assistant__message--bot">{assistantNodes.main.greeting}</div>
        {history.map((entry, index) => <div key={`${entry.user}-${index}`} className="finlit-assistant__turn"><div className="finlit-assistant__message finlit-assistant__message--user">{entry.user}</div>{entry.answer && <div className="finlit-assistant__message finlit-assistant__message--bot">{entry.answer}</div>}</div>)}
        {chatTurns.map((turn, index) => <div key={`ai-${index}`} className="finlit-assistant__turn"><div className={`finlit-assistant__message ${turn.role === "user" ? "finlit-assistant__message--user" : "finlit-assistant__message--bot"}`}>{turn.role === "assistant" ? <AssistantMarkdown content={turn.content} /> : turn.content}</div></div>)}
        {chatLoading && <div className="finlit-assistant__message finlit-assistant__message--bot finlit-assistant__typing" role="status" aria-label="FinLit AI is responding"><span /><span /><span /></div>}
        {chatError && <p className="finlit-assistant__error" role="alert">{chatError}</p>}
        {nodeId === MAIN_MENU_ID && <p className="finlit-assistant__prompt">{node.prompt}</p>}
        <div className={`finlit-assistant__options${nodeId === MAIN_MENU_ID ? " finlit-assistant__options--suggestions" : ""}`} aria-label="FinLit Assistant options">
          {node.options.map((option) => <button key={option.label} type="button" onClick={() => handleOption(option)}>{option.label}<ChevronRight size={15} aria-hidden="true" /></button>)}
        </div>
        {nodeId === MAIN_MENU_ID && <details className="finlit-assistant__more-options">
          <summary>More questions</summary>
          <div className="finlit-assistant__more-options-list">
            {node.additionalOptions.map((option) => <button key={option.label} type="button" onClick={() => handleOption(option)}>{option.label}<ChevronRight size={14} aria-hidden="true" /></button>)}
          </div>
        </details>}
        {nodeId !== MAIN_MENU_ID && <div className="finlit-assistant__navigation"><button type="button" onClick={goBack}><ArrowLeft size={14} />{node.backLabel || "Back"}</button><button type="button" onClick={mainMenu}><RotateCcw size={13} />Main Menu</button></div>}
      </div>
      <footer className="finlit-assistant__footer">FinLit AI provides general financial education and information about FinLit Ventures. This is not personalized investment advice.</footer>
      <form ref={composerRef} className="finlit-assistant__composer" onSubmit={sendMessage}>
        <label className="finlit-assistant__sr-only" htmlFor="finlit-assistant-message">Ask FinLit AI a question</label>
        <textarea id="finlit-assistant-message" value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={handleComposerKeyDown} placeholder="Ask FinLit AI anything..." maxLength={2000} rows={1} disabled={chatLoading} />
        <button type="submit" aria-label="Send message" disabled={chatLoading || !message.trim()}><Send size={16} aria-hidden="true" /></button>
      </form>
    </section>}
    <button ref={launcherRef} type="button" className="finlit-assistant__launcher" onClick={() => setOpen((value) => !value)} aria-label={open ? "Close FinLit Assistant" : "Open FinLit Assistant"} aria-expanded={open}>
      {open ? <X size={19} /> : <MessageCircle size={19} />}<span>Ask FinLit</span>
    </button>
  </div>;
}
